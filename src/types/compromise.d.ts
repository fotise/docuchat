declare module "compromise" {
  interface CompromiseMatch {
    out(format?: "array" | string): string[] | string
  }

  interface CompromiseDocument {
    dates?: () => CompromiseMatch
    match(pattern: string): CompromiseMatch
    money?: () => CompromiseMatch
    organizations?: () => CompromiseMatch
    people?: () => CompromiseMatch
    places?: () => CompromiseMatch
    percentages?: () => CompromiseMatch
    topics?: () => CompromiseMatch
  }

  export default function nlp(text: string): CompromiseDocument
}
