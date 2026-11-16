import type { Metadata } from "next";
import "./ads.css";
import { Sidebar } from "./sidebar";

export const metadata: Metadata = {
  title: "Ad Studio · Remix Studio",
  description: "Static Meta ad creatives: brand profile, references, concepts, images and PNG export.",
};

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ads">
      <Sidebar />
      <div className="ads-main">{children}</div>
    </div>
  );
}
