import type { Metadata } from "next";
import { PlatformPanel } from "@components/features/platform/platform-panel";

export const metadata: Metadata = { title: "Plataforma · Atiendo IA", robots: { index: false, follow: false } };

export default function PlatformPage(): React.ReactElement {
  return <PlatformPanel />;
}
