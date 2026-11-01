import { RemixView } from "./remix-view";

export default async function RemixPage({ params }: { params: Promise<{ id: string }> }) {
  return <RemixView id={(await params).id} />;
}
