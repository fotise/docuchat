import "@testing-library/jest-dom/vitest"
import * as React from "react"
import { vi } from "vitest"

function createRechartsStub(tagName: string) {
  return function RechartsStub({
    children,
    ...props
  }: {
    children?: React.ReactNode
  }) {
    return React.createElement(tagName, props, children)
  }
}

vi.mock("recharts", () => ({
  Area: createRechartsStub("div"),
  AreaChart: createRechartsStub("div"),
  CartesianGrid: createRechartsStub("div"),
  ResponsiveContainer: () => React.createElement("div", { "data-testid": "chart" }),
  Tooltip: createRechartsStub("div"),
  XAxis: createRechartsStub("div"),
  YAxis: createRechartsStub("div"),
}))

Object.defineProperty(globalThis, "ResizeObserver", {
  writable: true,
  value: class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})
