import type { DashboardConfig } from "@/types/dashboard"

export const dashboardConfig = {
  brand: {
    name: "Docu",
    accent: "Chat",
    icon: "fileText",
  },

  header: {
    speedLabel: "Search Test",
    engineLabel: "X1",
  },

  labels: {
    uploadButton: "Upload Files",
    manageButton: "Manage Workspace",
    activeChatsTitle: "Active Chats",
    uploadedDocumentsTitle: "Uploaded Documents",
    inputPlaceholder: "Ask something about your documents...",
    sendButton: "Send",
    assistantTyping: "Analyzing your request...",
    pageNotFoundTitle: "Workspace not found",
    pageNotFoundDescription: "The requested page does not exist or the route is invalid.",
    backHome: "Go to default workspace",
  },

  sidebar: {
    ctaLabel: "New Workspace",
    recentTitle: "Recent Chats",
    recentItems: [
      "Business Report Analysis",
      "Contract Q&A",
      "Italy Trip Itinerary",
    ],
  },

  chartSeries: [
    { key: "growth", gradientId: "series-growth", stroke: "#5dffb2" },
    { key: "reach", gradientId: "series-reach", stroke: "#49d1ff" },
    { key: "intent", gradientId: "series-intent", stroke: "#ff58cf" },
    { key: "signal", gradientId: "series-signal", stroke: "#a855f7" },
  ],

  workspaces: [
    {
      id: "market-research",
      path: "/workspaces/market-research",
      navLabel: "Market Research",
      navIcon: "folderKanban",
      title: "Market Research",
      documentCount: 6,
      documentLabel: "Documents Uploaded",
      isFavorite: true,
      tabs: [
        { id: "product-analysis", label: "Product Analysis", colorClass: "bg-sky-400" },
        { id: "survey-results", label: "Survey Results", colorClass: "bg-cyan-400" },
        { id: "competitor-insights", label: "Competitor Insights", colorClass: "bg-red-400" },
      ],
      views: [
        {
          tabId: "product-analysis",
          highlightedFile: { name: "Market_Overview.pdf", tone: "red" },
          initialMessages: [
            {
              id: "mr-pa-a",
              side: "right",
              text: "Sure! Here's a summary of the key market trends in industry...",
            },
            {
              id: "mr-pa-u",
              side: "left",
              text: "Give me a summary of the market trends.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 22, reach: 14, intent: 9, signal: 6 },
            { name: "Feb", growth: 24, reach: 16, intent: 10, signal: 7 },
            { name: "Mar", growth: 28, reach: 20, intent: 12, signal: 8 },
            { name: "Apr", growth: 26, reach: 19, intent: 11, signal: 9 },
            { name: "May", growth: 34, reach: 23, intent: 15, signal: 10 },
            { name: "Jun", growth: 42, reach: 30, intent: 18, signal: 12 },
            { name: "Jul", growth: 38, reach: 27, intent: 16, signal: 11 },
            { name: "Aug", growth: 31, reach: 22, intent: 14, signal: 10 },
          ],
        },
        {
          tabId: "survey-results",
          highlightedFile: { name: "Survey_Results.csv", tone: "green" },
          initialMessages: [
            {
              id: "mr-sr-a",
              side: "right",
              text: "I analyzed the survey responses and extracted the strongest customer signals.",
            },
            {
              id: "mr-sr-u",
              side: "left",
              text: "Show me the main takeaways from the survey data.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 12, reach: 18, intent: 8, signal: 5 },
            { name: "Feb", growth: 14, reach: 20, intent: 9, signal: 6 },
            { name: "Mar", growth: 18, reach: 25, intent: 11, signal: 7 },
            { name: "Apr", growth: 20, reach: 28, intent: 13, signal: 8 },
            { name: "May", growth: 25, reach: 32, intent: 15, signal: 10 },
            { name: "Jun", growth: 27, reach: 35, intent: 17, signal: 11 },
            { name: "Jul", growth: 24, reach: 31, intent: 16, signal: 10 },
            { name: "Aug", growth: 22, reach: 29, intent: 14, signal: 9 },
          ],
        },
        {
          tabId: "competitor-insights",
          highlightedFile: { name: "CompetitorTemp.docx", tone: "blue" },
          initialMessages: [
            {
              id: "mr-ci-a",
              side: "right",
              text: "Here is the competitor breakdown, including positioning gaps and momentum shifts.",
            },
            {
              id: "mr-ci-u",
              side: "left",
              text: "Compare us with the top competitors and highlight the gaps.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 16, reach: 12, intent: 14, signal: 8 },
            { name: "Feb", growth: 18, reach: 14, intent: 16, signal: 9 },
            { name: "Mar", growth: 21, reach: 15, intent: 18, signal: 10 },
            { name: "Apr", growth: 24, reach: 17, intent: 20, signal: 11 },
            { name: "May", growth: 29, reach: 20, intent: 24, signal: 13 },
            { name: "Jun", growth: 33, reach: 24, intent: 27, signal: 15 },
            { name: "Jul", growth: 31, reach: 22, intent: 25, signal: 14 },
            { name: "Aug", growth: 28, reach: 21, intent: 22, signal: 12 },
          ],
        },
      ],
      uploadedDocuments: [
        { id: "mr-1", name: "Market_Overview.pdf", type: "pdf", tone: "blue" },
        { id: "mr-2", name: "Sales_Report.docx", type: "doc", tone: "red" },
        { id: "mr-3", name: "Consumer_Trend.pdf", type: "pdf", tone: "red" },
        { id: "mr-4", name: "CompetitorTemp.docx", type: "doc", tone: "blue" },
        { id: "mr-5", name: "Survey_Results.csv", type: "csv", tone: "green" },
        { id: "mr-6", name: "Industry_Analysis.pptx", type: "ppt", tone: "red" },
      ],
    },

    {
      id: "legal-files",
      path: "/workspaces/legal-files",
      navLabel: "Legal Files",
      navIcon: "scale",
      title: "Legal Files",
      documentCount: 4,
      documentLabel: "Documents Uploaded",
      isFavorite: false,
      tabs: [
        { id: "contract-review", label: "Contract Review", colorClass: "bg-sky-400" },
        { id: "risk-summary", label: "Risk Summary", colorClass: "bg-cyan-400" },
        { id: "clause-comparison", label: "Clause Comparison", colorClass: "bg-red-400" },
      ],
      views: [
        {
          tabId: "contract-review",
          highlightedFile: { name: "Master_Agreement.pdf", tone: "red" },
          initialMessages: [
            {
              id: "lf-cr-a",
              side: "right",
              text: "I reviewed the draft agreement and highlighted the main legal exposure areas.",
            },
            {
              id: "lf-cr-u",
              side: "left",
              text: "Summarize the key contractual risks.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 10, reach: 14, intent: 7, signal: 5 },
            { name: "Feb", growth: 12, reach: 15, intent: 8, signal: 5 },
            { name: "Mar", growth: 15, reach: 18, intent: 10, signal: 6 },
            { name: "Apr", growth: 18, reach: 20, intent: 12, signal: 7 },
            { name: "May", growth: 21, reach: 23, intent: 13, signal: 8 },
            { name: "Jun", growth: 23, reach: 25, intent: 14, signal: 9 },
            { name: "Jul", growth: 20, reach: 22, intent: 13, signal: 8 },
            { name: "Aug", growth: 18, reach: 21, intent: 11, signal: 7 },
          ],
        },
        {
          tabId: "risk-summary",
          highlightedFile: { name: "Risk_Register.docx", tone: "blue" },
          initialMessages: [
            {
              id: "lf-rs-a",
              side: "right",
              text: "Here is the risk matrix grouped by liability, termination and indemnification.",
            },
            {
              id: "lf-rs-u",
              side: "left",
              text: "Group the legal risks by severity.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 9, reach: 12, intent: 11, signal: 4 },
            { name: "Feb", growth: 11, reach: 14, intent: 12, signal: 5 },
            { name: "Mar", growth: 13, reach: 16, intent: 14, signal: 6 },
            { name: "Apr", growth: 15, reach: 18, intent: 15, signal: 7 },
            { name: "May", growth: 17, reach: 19, intent: 17, signal: 8 },
            { name: "Jun", growth: 19, reach: 20, intent: 18, signal: 9 },
            { name: "Jul", growth: 18, reach: 19, intent: 17, signal: 8 },
            { name: "Aug", growth: 16, reach: 18, intent: 16, signal: 7 },
          ],
        },
        {
          tabId: "clause-comparison",
          highlightedFile: { name: "Clause_Comparison.xlsx", tone: "green" },
          initialMessages: [
            {
              id: "lf-cc-a",
              side: "right",
              text: "I compared standard clauses across the vendor templates and flagged deviations.",
            },
            {
              id: "lf-cc-u",
              side: "left",
              text: "Compare the clause sets across the contracts.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 8, reach: 10, intent: 9, signal: 4 },
            { name: "Feb", growth: 10, reach: 12, intent: 11, signal: 5 },
            { name: "Mar", growth: 12, reach: 13, intent: 14, signal: 6 },
            { name: "Apr", growth: 14, reach: 15, intent: 16, signal: 7 },
            { name: "May", growth: 16, reach: 17, intent: 18, signal: 8 },
            { name: "Jun", growth: 18, reach: 20, intent: 21, signal: 9 },
            { name: "Jul", growth: 17, reach: 18, intent: 19, signal: 8 },
            { name: "Aug", growth: 15, reach: 17, intent: 17, signal: 7 },
          ],
        },
      ],
      uploadedDocuments: [
        { id: "lf-1", name: "Master_Agreement.pdf", type: "pdf", tone: "red" },
        { id: "lf-2", name: "Risk_Register.docx", type: "doc", tone: "blue" },
        { id: "lf-3", name: "Clause_Comparison.xlsx", type: "xls", tone: "green" },
        { id: "lf-4", name: "Vendor_Terms.pdf", type: "pdf", tone: "red" },
      ],
    },

    {
      id: "travel-planning",
      path: "/workspaces/travel-planning",
      navLabel: "Travel Planning",
      navIcon: "briefcase",
      title: "Travel Planning",
      documentCount: 5,
      documentLabel: "Documents Uploaded",
      isFavorite: false,
      tabs: [
        { id: "budget-plan", label: "Budget Plan", colorClass: "bg-sky-400" },
        { id: "itinerary", label: "Itinerary", colorClass: "bg-cyan-400" },
        { id: "vendor-notes", label: "Vendor Notes", colorClass: "bg-red-400" },
      ],
      views: [
        {
          tabId: "budget-plan",
          highlightedFile: { name: "Budget_2026.xlsx", tone: "green" },
          initialMessages: [
            {
              id: "tp-bp-a",
              side: "right",
              text: "I summarized the travel costs and highlighted optimization opportunities.",
            },
            {
              id: "tp-bp-u",
              side: "left",
              text: "Where can we reduce travel costs?",
            },
          ],
          chartData: [
            { name: "Jan", growth: 14, reach: 11, intent: 6, signal: 4 },
            { name: "Feb", growth: 16, reach: 12, intent: 7, signal: 5 },
            { name: "Mar", growth: 19, reach: 14, intent: 9, signal: 6 },
            { name: "Apr", growth: 21, reach: 16, intent: 10, signal: 7 },
            { name: "May", growth: 24, reach: 18, intent: 12, signal: 8 },
            { name: "Jun", growth: 26, reach: 20, intent: 13, signal: 9 },
            { name: "Jul", growth: 23, reach: 18, intent: 12, signal: 8 },
            { name: "Aug", growth: 20, reach: 17, intent: 11, signal: 7 },
          ],
        },
        {
          tabId: "itinerary",
          highlightedFile: { name: "Executive_Trip.pdf", tone: "blue" },
          initialMessages: [
            {
              id: "tp-it-a",
              side: "right",
              text: "I organized the itinerary into arrival, meetings and return travel blocks.",
            },
            {
              id: "tp-it-u",
              side: "left",
              text: "Create a compact itinerary summary.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 10, reach: 17, intent: 8, signal: 4 },
            { name: "Feb", growth: 12, reach: 19, intent: 9, signal: 5 },
            { name: "Mar", growth: 15, reach: 22, intent: 11, signal: 6 },
            { name: "Apr", growth: 17, reach: 24, intent: 12, signal: 7 },
            { name: "May", growth: 19, reach: 27, intent: 14, signal: 8 },
            { name: "Jun", growth: 22, reach: 29, intent: 16, signal: 9 },
            { name: "Jul", growth: 20, reach: 26, intent: 14, signal: 8 },
            { name: "Aug", growth: 18, reach: 24, intent: 13, signal: 7 },
          ],
        },
        {
          tabId: "vendor-notes",
          highlightedFile: { name: "Hotel_Notes.docx", tone: "red" },
          initialMessages: [
            {
              id: "tp-vn-a",
              side: "right",
              text: "I collected vendor notes covering hotels, transfers and booking constraints.",
            },
            {
              id: "tp-vn-u",
              side: "left",
              text: "Summarize the vendor notes and constraints.",
            },
          ],
          chartData: [
            { name: "Jan", growth: 9, reach: 8, intent: 10, signal: 5 },
            { name: "Feb", growth: 11, reach: 9, intent: 11, signal: 6 },
            { name: "Mar", growth: 13, reach: 11, intent: 13, signal: 7 },
            { name: "Apr", growth: 15, reach: 12, intent: 14, signal: 8 },
            { name: "May", growth: 18, reach: 14, intent: 16, signal: 9 },
            { name: "Jun", growth: 20, reach: 16, intent: 18, signal: 10 },
            { name: "Jul", growth: 18, reach: 15, intent: 16, signal: 9 },
            { name: "Aug", growth: 16, reach: 14, intent: 15, signal: 8 },
          ],
        },
      ],
      uploadedDocuments: [
        { id: "tp-1", name: "Budget_2026.xlsx", type: "xls", tone: "green" },
        { id: "tp-2", name: "Executive_Trip.pdf", type: "pdf", tone: "blue" },
        { id: "tp-3", name: "Hotel_Notes.docx", type: "doc", tone: "red" },
        { id: "tp-4", name: "Flight_Options.pdf", type: "pdf", tone: "red" },
        { id: "tp-5", name: "Transfer_List.csv", type: "csv", tone: "green" },
      ],
    },
  ],
} satisfies DashboardConfig