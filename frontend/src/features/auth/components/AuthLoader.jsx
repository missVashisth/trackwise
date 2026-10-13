import { Loader2 } from "lucide-react";

function AuthLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Loading" />
    </div>
  );
}

export default AuthLoader;
