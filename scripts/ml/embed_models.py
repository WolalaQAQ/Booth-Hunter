"""
Adapted from the official Qwen3-VL-Embedding reference implementation:
https://huggingface.co/Qwen/Qwen3-VL-Embedding-2B/blob/main/scripts/qwen3_vl_embedding.py
License: Apache-2.0
"""

import json
import os
import sys
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Optional, Union

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from qwen_vl_utils.vision_process import process_vision_info
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


def _read_payload():
    raw = sys.stdin.buffer.read().decode("utf-8")
    if not raw.strip():
        raise SystemExit("Missing stdin JSON payload")
    return json.loads(raw)


def _device(payload):
    return payload.get("device") or os.environ.get("EMBED_DEVICE") or ("cuda" if torch.cuda.is_available() else "cpu")


def _torch_dtype(device: str):
    if device.startswith("cuda"):
        return torch.bfloat16
    return torch.float32


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
        self.model = Qwen3VLForEmbedding.from_pretrained(
            model_name_or_path,
            trust_remote_code=True,
            torch_dtype=_torch_dtype(device),
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


@lru_cache(maxsize=4)
def _load_embedder(model_id: str, device: str):
    return Qwen3VLEmbedder(model_id, device=device)


def _emit(model: str, embedding_space: str, vectors):
    serializable = []
    for vector in vectors:
        if hasattr(vector, "tolist"):
            vector = vector.tolist()
        serializable.append(vector)
    sys.stdout.write(
        json.dumps(
            {
                "model": model,
                "embeddingSpace": embedding_space,
                "vectors": serializable,
            },
            ensure_ascii=False,
        )
    )


def qwen_embed():
    payload = _read_payload()
    model_id = payload["modelId"]
    embedding_space = payload["embeddingSpace"]
    inputs = payload["inputs"]
    device = _device(payload)
    embedder = _load_embedder(model_id, device)
    vectors = embedder.process(inputs)
    _emit(model_id, embedding_space, vectors)


COMMANDS = {
    "qwen-embed": qwen_embed,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        raise SystemExit("Usage: embed_models.py <qwen-embed>")
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()
