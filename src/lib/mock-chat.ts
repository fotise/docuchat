interface BuildReplyParams {
  workspaceTitle: string
  tabLabel: string
  prompt: string
}

export function buildAssistantReply({
  workspaceTitle,
  tabLabel,
  prompt,
}: BuildReplyParams): string {
  const normalized = prompt.toLowerCase()

  if (normalized.includes("summary") || normalized.includes("summarize")) {
    return `I summarized the main points for "${tabLabel}" in "${workspaceTitle}". The strongest signal is improving, one secondary trend needs validation, and two follow-up areas should be reviewed next.`
  }

  if (normalized.includes("compare")) {
    return `Here is a comparison for "${tabLabel}" in "${workspaceTitle}": the leading items show a clear gap on positioning, execution consistency, and evidence quality. I would review the outliers first.`
  }

  if (normalized.includes("risk")) {
    return `For "${tabLabel}" in "${workspaceTitle}", the largest risks appear concentrated in the highest-impact items, with moderate uncertainty in the middle tier and a few low-priority issues below.`
  }

  return `I processed your request for "${tabLabel}" in "${workspaceTitle}". Short answer: the main signal is positive, the supporting evidence is mixed, and the next best step is a focused review of the top drivers.`
}