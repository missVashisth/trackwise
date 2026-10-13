function SidebarSection({ title, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      {title && <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>}
      {children}
    </div>
  );
}

export default SidebarSection;
