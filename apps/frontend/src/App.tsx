import "styles/globals.css";
import { Form } from "./components/Form";
import { Interview } from "./components/Interview";
import { Result } from "./components/Result";
import { Dashboard } from "./components/Dashboard";
import { Toaster } from "sonner";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router";
import { ClerkProvider, SignedIn, SignedOut, useAuth, SignIn } from "@clerk/clerk-react";
import { useEffect } from "react";
import axios from "axios";

const CLERK_PUBLISHABLE_KEY = "pk_test_Z3Jvd2luZy1zaGFyay0xLmNsZXJrLmFjY291bnRzLmRldiQ";

// Component to handle route redirection and token injection
function AuthInterceptor({ children }: { children: React.ReactNode }) {
    const { getToken } = useAuth();

    useEffect(() => {
        // Axios request interceptor to inject JWT bearer tokens
        const interceptor = axios.interceptors.request.use(async (config) => {
            try {
                const mockUser = localStorage.getItem("sf_mock_user");
                if (mockUser) {
                    config.headers.Authorization = `Bearer mock_${mockUser}`;
                    return config;
                }
                const token = await getToken();
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
            } catch (err) {
                console.error("Failed to inject auth token:", err);
            }
            return config;
        });

        return () => {
            axios.interceptors.request.eject(interceptor);
        };
    }, [getToken]);

    return <>{children}</>;
}

export function App() {
    const hasMock = !!localStorage.getItem("sf_mock_user");

    return (
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
            <BrowserRouter>
                <AuthInterceptor>
                    <Routes>
                        {/* Landing Page is now the Kickstart Form */}
                        <Route path="/" element={<Form />} />
                        <Route
                            path="/dashboard"
                            element={
                                <>
                                    {hasMock ? (
                                        <Dashboard />
                                    ) : (
                                        <>
                                            <SignedIn>
                                                <Dashboard />
                                            </SignedIn>
                                            <SignedOut>
                                                <div className="flex min-h-screen w-screen flex-col items-center justify-center bg-black text-white px-6 py-12">
                                                    <div className="flex flex-col items-center gap-6 w-full max-w-md">
                                                        <SignIn fallbackRedirectUrl="/dashboard" />
                                                        
                                                        <div className="flex items-center justify-center gap-2 pt-2 border-t border-zinc-950 w-full">
                                                            <button
                                                                onClick={() => {
                                                                    localStorage.setItem("sf_mock_user", "rajat");
                                                                    window.location.reload();
                                                                }}
                                                                className="text-[10px] text-zinc-500 hover:text-zinc-300 font-mono"
                                                            >
                                                                [Bypass Auth (Simulated Account)]
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </SignedOut>
                                        </>
                                    )}
                                </>
                            }
                        />
                        <Route path="/invite/job/:jobId" element={<Form />} />
                        <Route path="/interview/:interviewId" element={<Interview />} />
                        <Route path="/result/:interviewId" element={<Result />} />
                    </Routes>
                </AuthInterceptor>
                <Toaster position="bottom-left" />
            </BrowserRouter>
        </ClerkProvider>
    );
}

export default App;
