import { Link } from "react-router";

function AuthLayout({ title, subtitle, error, notice, footerText, footerLinkText, footerTo, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white shadow-md">
            G
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          {notice && !error && (
            <div role="status" className="mb-5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-sm text-indigo-800">
              {notice}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          {children}
        </div>

        {footerText && (
          <p className="mt-6 text-center text-sm text-slate-500">
            {footerText}{" "}
            <Link
              to={footerTo}
              className="font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              {footerLinkText}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}

export default AuthLayout;
