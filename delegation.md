# Delegation

The main session plans and reviews. Writing code is the executor's job.

- Break the request into small tasks, one per executor.
- Run independent tasks in parallel.
- If the result is wrong, send the executor back to fix it.
- Write code directly only for 1 or 2 line tweaks.
- Don't pass `model` or `effort` when calling Agent or in workflow `agent()` calls. The model-router hook asks Jev and fills in both. Set them only when you have a concrete reason.
- Describe the task clearly in the executor prompt: Jev picks the model by reading that text.
