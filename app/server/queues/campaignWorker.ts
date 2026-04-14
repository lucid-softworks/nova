// Campaign orchestration lands fully in Stage 5. This stub is imported by the
// post worker so it can signal step completions when a campaign post lands.

export async function onStepComplete(_stepId: string, _success: boolean) {
  // TODO: Stage 5 — update campaign_steps status, cascade to dependents, set
  // campaign status to published/on_hold/partial/failed, emit notifications.
}
