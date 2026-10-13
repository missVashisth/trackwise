import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn.js";
import { inputClassName } from "./Input.jsx";

/**
 * Native select with consistent styling.
 * options: [{ value, label }]
 */
function Select({ options, placeholder, className, invalid, ...rest }) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(inputClassName, "appearance-none pr-9", invalid && "border-red-400", className)}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        aria-hidden="true"
      />
    </div>
  );
}

export default Select;
