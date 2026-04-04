import {
  AlertTriangle,
  BellRing,
  FileSearch,
  Globe2,
  Home,
  LayoutDashboard,
  Package2,
  PlugZap,
  Settings2,
  ShieldCheck,
  BriefcaseBusiness,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  section: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/", label: "Overview", icon: Home, section: "Overview" }],
  },
  {
    title: "Engineering Ops",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, section: "Engineering Ops" },
      { href: "/aog", label: "Incidents", icon: AlertTriangle, section: "Engineering Ops" },
      { href: "/reliability", label: "Reliability", icon: ShieldCheck, section: "Engineering Ops" },
      { href: "/spares", label: "Spares", icon: Package2, section: "Engineering Ops" },
      { href: "/docs", label: "Documents", icon: FileSearch, section: "Engineering Ops" },
    ],
  },
  {
    title: "Network",
    items: [{ href: "/flights", label: "Network", icon: Globe2, section: "Network" }],
  },
  {
    title: "Control Plane",
    items: [
      { href: "/alerts", label: "Alerts", icon: BellRing, section: "Control Plane" },
      { href: "/cases", label: "Cases", icon: BriefcaseBusiness, section: "Control Plane" },
      { href: "/connectors", label: "Connectors", icon: PlugZap, section: "Control Plane" },
      { href: "/admin", label: "Admin", icon: Settings2, section: "Control Plane" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export const PAGE_METADATA: Record<string, { title: string; description: string }> = {
  "/": {
    title: "Engineering Control Tower",
    description: "Fleet reliability, AOG triage, spares exposure, documents, and control-plane visibility in one airline workspace.",
  },
  "/dashboard": {
    title: "Fleet Reliability Dashboard",
    description: "Monitor dispatch-impacting defects, ATA trends, and aircraft risk exposure across the active fleet.",
  },
  "/aog": {
    title: "Incident Command Queue",
    description: "Triage dispatch-critical incidents by severity, recurrence, delay impact, and material exposure.",
  },
  "/flights": {
    title: "Network Intelligence Workspace",
    description: "Monitor global traffic, owned-fleet overlays, disruption hotspots, and maintenance bases in a dense operational map workspace.",
  },
  "/reliability": {
    title: "Reliability Analytics",
    description: "Review repeat defects, ATA concentration, vendor performance, and rectification behavior over time.",
  },
  "/spares": {
    title: "Spares Recommendation Panel",
    description: "Identify critical low-stock parts, projected demand, and immediate reorder requirements for line support.",
  },
  "/docs": {
    title: "Technical Document Assistant",
    description: "Search manual excerpts, MEL notes, and reliability procedures using local semantic retrieval with fallback keyword search.",
  },
  "/alerts": {
    title: "Alert Command Center",
    description: "Monitor routed engineering alerts, severity bands, source events, and triage ownership across the selected airline workspace.",
  },
  "/cases": {
    title: "Case Workflow Board",
    description: "Track escalations, SLA clocks, investigation ownership, and case timeline progress from alert to engineering action.",
  },
  "/connectors": {
    title: "Connector Control Plane",
    description: "Manage airline integrations, manifest-driven configuration, sync health, and connector runtime posture.",
  },
  "/admin": {
    title: "Workspace Administration",
    description: "Review tenant branding, fleets, stations, users, and platform environment health for the active airline workspace.",
  },
  "/aircraft": {
    title: "Aircraft Reliability Detail",
    description: "Inspect defect history, recurring components, maintenance activity, and current risk on a single tail.",
  },
};

export const CHART_COLORS = {
  primary: "#0B203D",
  secondary: "#284969",
  accent: "#7ED7E0",
  muted: "#90A4B8",
  success: "#0F766E",
  warning: "#C97A12",
  danger: "#B73A3A",
  grid: "#D6E1E8",
};

export const SAMPLE_DOC_QUERIES = [
  "What procedure is relevant for autopilot disconnect warning?",
  "Which document section discusses hydraulic leak rectification?",
  "What guidance exists for multiple inoperative IFE screens?",
  "Show the maintenance reference for repeated flight control fault isolation.",
];
