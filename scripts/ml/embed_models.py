"""
Adapted from the official Qwen3-VL-Embedding reference implementation:
https://huggingface.co/Qwen/Qwen3-VL-Embedding-2B/blob/main/scripts/qwen3_vl_embedding.py
License: Apache-2.0
"""

import json
import os
import sys
import unicodedata
import importlib.util
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Union

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from qwen_vl_utils.vision_process import process_vision_info
from transformers import AutoProcessor, Qwen3VLForConditionalGeneration
from transformers.modeling_utils import ALL_ATTENTION_FUNCTIONS
from transformers.cache_utils import Cache
from transformers.modeling_outputs import ModelOutput
from transformers.models.qwen3_vl.modeling_qwen3_vl import (
    Qwen3VLConfig,
    Qwen3VLModel,
    Qwen3VLPreTrainedModel,
)
from transformers.models.qwen3_vl.processing_qwen3_vl import Qwen3VLProcessor

MAX_LENGTH = 8192
IMAGE_BASE_FACTOR = 16
IMAGE_FACTOR = IMAGE_BASE_FACTOR * 2
MIN_PIXELS = 4 * IMAGE_FACTOR * IMAGE_FACTOR
MAX_PIXELS = 1800 * IMAGE_FACTOR * IMAGE_FACTOR


def _chunk(items, batch_size: int):
    safe_batch_size = max(1, int(batch_size))
    for index in range(0, len(items), safe_batch_size):
        yield items[index : index + safe_batch_size]


def _read_payload():
    raw = sys.stdin.buffer.read().decode("utf-8")
    if not raw.strip():
        raise SystemExit("Missing stdin JSON payload")
    return json.loads(raw)


def _write_json_line(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _write_worker_message(payload):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(f"{len(raw)}\n".encode("utf-8"))
    sys.stdout.buffer.write(raw)
    sys.stdout.buffer.flush()


def _read_worker_message():
    header = sys.stdin.buffer.readline()
    if not header:
        return None

    length = int(header.decode("utf-8").strip())
    raw = sys.stdin.buffer.read(length)
    if len(raw) != length:
        raise ValueError(f"Expected {length} bytes from worker stdin, received {len(raw)}.")
    return json.loads(raw.decode("utf-8"))


def _device(payload):
    return payload.get("device") or os.environ.get("EMBED_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")


def _torch_dtype(device: str):
    if device.startswith("cuda"):
        return torch.bfloat16
    return torch.float32


def _configure_torch_backends(device: str):
    if device.startswith("cuda"):
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True


def _flash_attention_available() -> bool:
    return importlib.util.find_spec("flash_attn") is not None


def _supported_attention_implementations() -> List[str]:
    try:
        valid_keys = list(ALL_ATTENTION_FUNCTIONS.valid_keys())
    except Exception:
        valid_keys = ["sdpa", "flash_attention_2", "flash_attention_3", "flex_attention"]
    return ["eager", *valid_keys]


def _resolve_attn_implementation(payload, device: str):
    requested = payload.get("attnImplementation") or os.environ.get("EMBED_ATTN_IMPLEMENTATION") or "flash_attention_2"
    requested = str(requested)
    if requested == "auto":
        if device.startswith("cuda") and _flash_attention_available():
            return "flash_attention_2"
        return "sdpa" if device.startswith("cuda") else "eager"

    return requested


def _attention_runtime_info(payload):
    device = _device(payload)
    requested = payload.get("attnImplementation") or os.environ.get("EMBED_ATTN_IMPLEMENTATION") or "flash_attention_2"
    requested = str(requested)
    supported = _supported_attention_implementations()
    flash_available = _flash_attention_available()
    resolved = _resolve_attn_implementation(payload, device)
    unsupported_reason = None

    if requested == "flash_attention_2" and not (device.startswith("cuda") and flash_available):
        resolved = None
        unsupported_reason = "flash_attn is not installed or not available for flash_attention_2."
    elif requested != "auto" and requested not in supported:
        resolved = None
        unsupported_reason = f"{requested} is not a supported attention backend in the current transformers runtime."

    return {
        "python": sys.executable,
        "flashAttentionAvailable": flash_available,
        "cudaAvailable": torch.cuda.is_available(),
        "torchVersion": torch.__version__,
        "device": device,
        "requestedAttentionImplementation": requested,
        "resolvedAttentionImplementation": resolved,
        "supportedAttentionImplementations": supported,
        "unsupportedAttentionReason": unsupported_reason,
    }


@dataclass
class Qwen3VLForEmbeddingOutput(ModelOutput):
    last_hidden_state: Optional[torch.FloatTensor] = None
    attention_mask: Optional[torch.Tensor] = None


class Qwen3VLForEmbedding(Qwen3VLPreTrainedModel):
    _checkpoint_conversion_mapping = {}
    accepts_loss_kwargs = False
    config: Qwen3VLConfig

    def __init__(self, config):
        super().__init__(config)
        self.model = Qwen3VLModel(config)
        self.post_init()

    def forward(
        self,
        input_ids: torch.LongTensor = None,
        attention_mask: Optional[torch.Tensor] = None,
        position_ids: Optional[torch.LongTensor] = None,
        past_key_values: Optional[Cache] = None,
        inputs_embeds: Optional[torch.FloatTensor] = None,
        pixel_values: Optional[torch.Tensor] = None,
        pixel_values_videos: Optional[torch.FloatTensor] = None,
        image_grid_thw: Optional[torch.LongTensor] = None,
        video_grid_thw: Optional[torch.LongTensor] = None,
        cache_position: Optional[torch.LongTensor] = None,
        **kwargs,
    ) -> Union[tuple, Qwen3VLForEmbeddingOutput]:
        outputs = self.model(
            input_ids=input_ids,
            pixel_values=pixel_values,
            pixel_values_videos=pixel_values_videos,
            image_grid_thw=image_grid_thw,
            video_grid_thw=video_grid_thw,
            position_ids=position_ids,
            attention_mask=attention_mask,
            past_key_values=past_key_values,
            inputs_embeds=inputs_embeds,
            cache_position=cache_position,
            **kwargs,
        )
        return Qwen3VLForEmbeddingOutput(
            last_hidden_state=outputs.last_hidden_state,
            attention_mask=attention_mask,
        )


class Qwen3VLEmbedder:
    def __init__(
        self,
        model_name_or_path: str,
        device: str,
        attn_implementation: str,
        max_length: int = MAX_LENGTH,
        instruction: Optional[str] = None,
        min_pixels: int = MIN_PIXELS,
        max_pixels: int = MAX_PIXELS,
    ):
        self.device = torch.device(device)
        self.max_length = max_length
        self.instruction = instruction or "Represent the input for multimodal retrieval."
        self.min_pixels = min_pixels
        self.max_pixels = max_pixels
        self.attn_implementation = attn_implementation
        _configure_torch_backends(device)
        self.model = Qwen3VLForEmbedding.from_pretrained(
            model_name_or_path,
            trust_remote_code=True,
            torch_dtype=_torch_dtype(device),
            attn_implementation=attn_implementation,
            low_cpu_mem_usage=True,
        ).to(self.device)
        self.processor = Qwen3VLProcessor.from_pretrained(
            model_name_or_path,
            padding_side="right",
        )
        self.model.eval()

    def format_model_input(
        self,
        text: Optional[str] = None,
        image: Optional[Union[str, Image.Image]] = None,
        instruction: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        local_instruction = (instruction or self.instruction).strip()
        if local_instruction and not unicodedata.category(local_instruction[-1]).startswith("P"):
            local_instruction = local_instruction + "."

        content = []
        conversation = [
            {"role": "system", "content": [{"type": "text", "text": local_instruction}]},
            {"role": "user", "content": content},
        ]

        if image:
            if isinstance(image, str):
                image_content = image if image.startswith(("http", "https", "oss", "file://")) else "file://" + image
            else:
                image_content = image
            content.append(
                {
                    "type": "image",
                    "image": image_content,
                    "min_pixels": self.min_pixels,
                    "max_pixels": self.max_pixels,
                }
            )

        if text:
            content.append({"type": "text", "text": text})

        if not content:
            content.append({"type": "text", "text": ""})

        return conversation

    def _preprocess_inputs(self, conversations: List[List[Dict[str, Any]]]) -> Dict[str, torch.Tensor]:
        text = self.processor.apply_chat_template(
            conversations,
            add_generation_prompt=True,
            tokenize=False,
        )
        images, _video_inputs = process_vision_info(conversations, image_patch_size=16)
        inputs = self.processor(
            text=text,
            images=images,
            truncation=True,
            max_length=self.max_length,
            padding=True,
            do_resize=False,
            return_tensors="pt",
        )
        return {key: value.to(self.device) for key, value in inputs.items()}

    @staticmethod
    def _pooling_last(hidden_state: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        flipped_tensor = attention_mask.flip(dims=[1])
        last_one_positions = flipped_tensor.argmax(dim=1)
        col = attention_mask.shape[1] - last_one_positions - 1
        row = torch.arange(hidden_state.shape[0], device=hidden_state.device)
        return hidden_state[row, col]

    @torch.no_grad()
    def process(self, inputs: List[Dict[str, Any]], normalize: bool = True):
        conversations = [
            self.format_model_input(
                text=element.get("text"),
                image=element.get("image"),
                instruction=element.get("instruction"),
            )
            for element in inputs
        ]
        processed_inputs = self._preprocess_inputs(conversations)
        outputs = self.model(**processed_inputs)
        embeddings = self._pooling_last(outputs.last_hidden_state, outputs.attention_mask)
        if normalize:
            embeddings = F.normalize(embeddings, p=2, dim=-1)
        return embeddings


def _normalize_image_input(image: Optional[Union[str, Image.Image]]):
    if not image:
        return None
    if isinstance(image, str):
        return image if image.startswith(("http", "https", "oss", "file://")) else "file://" + image
    return image


class Qwen3VLReranker:
    def __init__(
        self,
        model_name_or_path: str,
        device: str,
        attn_implementation: str,
        max_length: int = MAX_LENGTH,
        instruction: Optional[str] = None,
        min_pixels: int = MIN_PIXELS,
        max_pixels: int = MAX_PIXELS,
    ):
        self.device = torch.device(device)
        self.max_length = max_length
        self.instruction = instruction or "Judge whether the BOOTH candidate item matches the query."
        self.min_pixels = min_pixels
        self.max_pixels = max_pixels
        _configure_torch_backends(device)
        self.model = Qwen3VLForConditionalGeneration.from_pretrained(
            model_name_or_path,
            trust_remote_code=True,
            torch_dtype=_torch_dtype(device),
            attn_implementation=attn_implementation,
            low_cpu_mem_usage=True,
        ).to(self.device)
        self.processor = AutoProcessor.from_pretrained(
            model_name_or_path,
            padding_side="left",
        )
        self.model.eval()
        self.yes_token_id = self._single_token_id("yes")
        self.no_token_id = self._single_token_id("no")

    def _single_token_id(self, token_text: str) -> int:
        token_ids = self.processor.tokenizer.encode(token_text, add_special_tokens=False)
        if len(token_ids) != 1:
            raise ValueError(f"Expected a single token id for '{token_text}', got {token_ids}")
        return token_ids[0]

    def format_model_input(
        self,
        query: Dict[str, Any],
        document: Dict[str, Any],
        instruction: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        local_instruction = (instruction or self.instruction).strip()
        if local_instruction and not unicodedata.category(local_instruction[-1]).startswith("P"):
            local_instruction = local_instruction + "."

        content = []
        if query.get("image"):
            content.append(
                {
                    "type": "image",
                    "image": _normalize_image_input(query.get("image")),
                    "min_pixels": self.min_pixels,
                    "max_pixels": self.max_pixels,
                }
            )
        if query.get("text"):
            content.append({"type": "text", "text": f"Query: {query.get('text')}"})

        if document.get("image"):
            content.append(
                {
                    "type": "image",
                    "image": _normalize_image_input(document.get("image")),
                    "min_pixels": self.min_pixels,
                    "max_pixels": self.max_pixels,
                }
            )
        if document.get("text"):
            content.append({"type": "text", "text": f"Candidate: {document.get('text')}"})

        if not content:
            content.append({"type": "text", "text": ""})

        return [
            {"role": "system", "content": [{"type": "text", "text": local_instruction}]},
            {"role": "user", "content": content},
        ]

    def _preprocess_inputs(self, conversation: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
        text = self.processor.apply_chat_template(
            [conversation],
            add_generation_prompt=True,
            tokenize=False,
        )
        images, videos = process_vision_info([conversation], image_patch_size=16)
        inputs = self.processor(
            text=text,
            images=images,
            videos=videos,
            truncation=True,
            max_length=self.max_length,
            padding=True,
            do_resize=False,
            return_tensors="pt",
        )
        return {key: value.to(self.device) for key, value in inputs.items()}

    @torch.no_grad()
    def score(self, query: Dict[str, Any], documents: List[Dict[str, Any]], instruction: Optional[str] = None) -> List[float]:
        scores = []
        for document in documents:
            conversation = self.format_model_input(query, document, instruction=instruction)
            inputs = self._preprocess_inputs(conversation)
            logits = self.model(**inputs).logits[:, -1, [self.no_token_id, self.yes_token_id]]
            probabilities = torch.softmax(logits, dim=-1)[:, 1]
            scores.extend(float(value) for value in probabilities.detach().cpu().tolist())
        return scores


@lru_cache(maxsize=4)
def _load_embedder(model_id: str, device: str, attn_implementation: str, max_length: int, min_pixels: int, max_pixels: int):
    return Qwen3VLEmbedder(
        model_id,
        device=device,
        attn_implementation=attn_implementation,
        max_length=max_length,
        min_pixels=min_pixels,
        max_pixels=max_pixels,
    )


@lru_cache(maxsize=2)
def _load_reranker(model_id: str, device: str, attn_implementation: str, max_length: int, min_pixels: int, max_pixels: int):
    return Qwen3VLReranker(
        model_id,
        device=device,
        attn_implementation=attn_implementation,
        max_length=max_length,
        min_pixels=min_pixels,
        max_pixels=max_pixels,
    )


def _serialize_vectors(vectors):
    serializable = []
    for vector in vectors:
        if hasattr(vector, "tolist"):
            vector = vector.tolist()
        serializable.append(vector)
    return serializable


def _emit_progress(label: str, completed: int, total: int):
    sys.stderr.write(f"{label} {completed}/{total}\n")
    sys.stderr.flush()


def _qwen_env(payload):
    return _attention_runtime_info(payload)


def _qwen_embed(payload):
    model_id = payload["modelId"]
    embedding_space = payload["embeddingSpace"]
    inputs = payload["inputs"]
    batch_size = int(payload.get("batchSize") or 4)
    progress_label = payload.get("progressLabel") or "qwen-embed"
    device = _device(payload)
    max_length = int(payload.get("maxLength") or MAX_LENGTH)
    min_pixels = int(payload.get("minPixels") or MIN_PIXELS)
    max_pixels = int(payload.get("maxPixels") or MAX_PIXELS)
    attn_implementation = _resolve_attn_implementation(payload, device)
    embedder = _load_embedder(model_id, device, attn_implementation, max_length, min_pixels, max_pixels)
    vectors = []
    total = len(inputs)
    completed = 0
    for batch in _chunk(inputs, batch_size):
        batch_vectors = embedder.process(batch)
        vectors.extend(batch_vectors.detach().cpu())
        completed += len(batch)
        _emit_progress(progress_label, completed, total)
    return {
        "model": model_id,
        "embeddingSpace": embedding_space,
        "vectors": _serialize_vectors(vectors),
    }


def _qwen_rerank(payload):
    model_id = payload["modelId"]
    query = payload["query"]
    documents = payload["documents"]
    instruction = payload.get("instruction")
    device = _device(payload)
    max_length = int(payload.get("maxLength") or MAX_LENGTH)
    min_pixels = int(payload.get("minPixels") or MIN_PIXELS)
    max_pixels = int(payload.get("maxPixels") or MAX_PIXELS)
    attn_implementation = _resolve_attn_implementation(payload, device)
    reranker = _load_reranker(model_id, device, attn_implementation, max_length, min_pixels, max_pixels)
    scores = reranker.score(query, documents, instruction=instruction)
    return {
        "model": model_id,
        "scores": [float(score) for score in scores],
    }


def qwen_env():
    _write_json_line(_qwen_env(_read_payload()))


def qwen_embed():
    _write_json_line(_qwen_embed(_read_payload()))


def qwen_rerank():
    _write_json_line(_qwen_rerank(_read_payload()))


def qwen_worker():
    while True:
        request = _read_worker_message()
        if request is None:
            break
        request_id = request.get("id")
        command = request.get("command")
        payload = request.get("payload") or {}

        try:
            if command == "qwen-env":
                result = _qwen_env(payload)
            elif command == "qwen-embed":
                result = _qwen_embed(payload)
            elif command == "qwen-rerank":
                result = _qwen_rerank(payload)
            else:
                raise ValueError(f"Unsupported worker command: {command}")

            _write_worker_message(
                {
                    "id": request_id,
                    "ok": True,
                    "result": result,
                }
            )
        except Exception as exc:
            _write_worker_message(
                {
                    "id": request_id,
                    "ok": False,
                    "error": {
                        "type": exc.__class__.__name__,
                        "message": str(exc),
                    },
                }
            )


COMMANDS = {
    "qwen-env": qwen_env,
    "qwen-embed": qwen_embed,
    "qwen-rerank": qwen_rerank,
    "qwen-worker": qwen_worker,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        raise SystemExit("Usage: embed_models.py <qwen-env|qwen-embed|qwen-rerank|qwen-worker>")
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()
