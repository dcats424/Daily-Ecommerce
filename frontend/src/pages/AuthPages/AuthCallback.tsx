import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No token received from Google login");
      return;
    }

    login(token);
    // Full page reload ensures AuthContext reads from localStorage
    window.location.href = "/";
  }, [searchParams, login]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md p-8">
          <p className="text-error-500 text-lg font-semibold mb-2">
            Login Failed
          </p>
          <p className="text-gray-500 mb-4">{error}</p>
          <a
            href="/signin"
            className="inline-block px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600"
          >
            Back to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-brand-500 mx-auto mb-4" />
        <p className="text-gray-500">Logging you in...</p>
      </div>
    </div>
  );
}
