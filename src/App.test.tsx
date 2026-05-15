import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import App from "./App"

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.pushState({}, "", "/")
})

describe("App", () => {
  it("redirects to the default workspace", async () => {
    render(<App />)

    expect(await screen.findAllByText("Market Research")).not.toHaveLength(0)
  })

  it("announces placeholder upload controls", async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Upload Files" }))

    expect(screen.getByText("File upload is not connected yet.")).toBeTruthy()
  })
})
