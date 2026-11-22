---
name: local-llm-gpu-tuner
description: "Diagnose NVIDIA CUDA VRAM, temperature, and LM Studio models (127.0.0.1:1234), and balance GPU memory across local LLMs, Whisper STT, and Chatterbox TTS."
version: 1.0.0
author: Foolmoon
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [gpu, vram, cuda, lmstudio, qwen, gemma, nvidia, performance, tuning]
    category: devops
    related_skills: [windows-power-automation, foolmoon-autonomy]
---

# Local LLM & CUDA GPU Tuner

Keep local inference fast and OOM-free when running LM Studio (`http://127.0.0.1:1234/v1`), Whisper speech-to-text, and Chatterbox CUDA voice cloning side by side on NVIDIA GPUs.

## Quick Diagnostics (`terminal`)
1. **Check GPU VRAM, Temp, Power & Active Processes:**
   ```powershell
   nvidia-smi
   ```
2. **Inspect Loaded LM Studio Models:**
   ```powershell
   Invoke-RestMethod http://127.0.0.1:1234/v1/models | ConvertTo-Json -Depth 4
   ```
3. **Benchmark Latency & Tokens/s Safely:** Send a tiny short-output completion to `http://127.0.0.1:1234/v1/chat/completions` when troubleshooting slow replies.

## Practical 16GB VRAM Budget Rules (e.g. RTX 4070 Ti SUPER)
- Keep LLM + KV cache (`~7–11 GB` for 9B–14B Q4_K_M / Q6_K) leaving `>= 3.5–4.5 GB` headroom when **Chatterbox TTS CUDA** (`~2.2–3.0 GB`) and **Whisper** (`~0.8–1.5 GB`) are active concurrently.
- If generations stall or spill to system RAM (`Shared GPU Memory` spike): recommend lowering context length (`8192` -> `4096` or `16384`), switching KV cache to Q8_0, or using a lighter quant (`Q4_K_M`).
- Check Foolmoon Desktop voice leases & `~/.hermes/config.yaml` (`tts.provider`, `model.default`) before changing model settings.
