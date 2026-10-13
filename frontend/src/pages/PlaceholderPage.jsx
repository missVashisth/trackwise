import { Menu, Sparkles } from "lucide-react";
import { useOutletContext } from "react-router";
import { EmptyState, IconButton } from "../components/ui/index.js";

function PlaceholderPage({ title, icon }) {
  const { onOpenSidebar } = useOutletContext() ?? {};

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <IconButton icon={Menu} label="Open navigation" onClick={onOpenSidebar} className="lg:hidden" />
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      </div>
      <EmptyState icon={icon ?? Sparkles} title={`${title} is coming soon`} description="This section is scaffolded in the sidebar so the navigation is complete. Build its feature folder the same way as goals." />
    </div>
  );
}

export default PlaceholderPage;
