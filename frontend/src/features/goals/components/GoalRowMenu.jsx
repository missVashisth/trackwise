import { CheckCircle2, MoreHorizontal, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { IconButton, MenuDivider, MenuItem, Popover } from "../../../components/ui/index.js";

function GoalRowMenu({ goal, onEdit, onToggleFavorite, onToggleComplete, onDelete }) {
  return (
    <Popover
      width="w-48"
      trigger={({ active, ...props }) => (
        <IconButton
          icon={MoreHorizontal}
          label="Goal actions"
          size="sm"
          active={active}
          className={active ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}
          {...props}
        />
      )}
    >
      <MenuItem icon={Pencil} onSelect={() => onEdit(goal)}>Edit goal</MenuItem>
      <MenuItem icon={Star} onSelect={() => onToggleFavorite(goal)}>
        {goal.isFavorite ? "Remove from favorites" : "Add to favorites"}
      </MenuItem>
      <MenuItem icon={goal.completedAt ? RotateCcw : CheckCircle2} onSelect={() => onToggleComplete(goal)}>
        {goal.completedAt ? "Reopen goal" : "Complete goal"}
      </MenuItem>
      <MenuDivider />
      <MenuItem icon={Trash2} tone="danger" onSelect={() => onDelete(goal)}>Delete goal</MenuItem>
    </Popover>
  );
}

export default GoalRowMenu;
