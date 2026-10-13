import { cn } from "../../lib/cn.js";
import { inputClassName } from "./Input.jsx";

function Textarea({ className, rows = 2, ...rest }) {
  return <textarea rows={rows} className={cn(inputClassName, "resize-none", className)} {...rest} />;
}

export default Textarea;
