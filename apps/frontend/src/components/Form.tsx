import { useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router";
import { ArrowRight, Github, Loader2, Mic, FileText } from "lucide-react";

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = (e) => reject(e);
        document.head.appendChild(script);
    });
}

async function extractTextFromPdf(file: File): Promise<string> {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
    
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = (window as any).pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
    }
    
    return fullText;
}

export function Form() {
    const [candidateName, setCandidateName] = useState("");
    const [targetRole, setTargetRole] = useState("");
    const [type, setType] = useState<"github" | "resume">("github");
    const [github, setGithub] = useState("");
    const [resumeText, setResumeText] = useState("");
    const [loading, setLoading] = useState(false);
    
    const [dragging, setDragging] = useState(false);
    const [parsingPdf, setParsingPdf] = useState(false);
    const [pdfName, setPdfName] = useState("");
    
    const navigate = useNavigate();

    async function onSubmit() {
        if (!candidateName.trim()) {
            toast("Please provide your full name");
            return;
        }
        if (!targetRole.trim()) {
            toast("Please specify the target role or job description");
            return;
        }
        if (type === "github" && !github.trim()) {
            toast("Please provide a valid GitHub profile URL");
            return;
        }
        if (type === "resume" && !resumeText.trim()) {
            toast("Please paste your resume details or upload a resume PDF");
            return;
        }

        setLoading(true);
        try {
            const response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
                candidateName: candidateName.trim(),
                targetRole: targetRole.trim(),
                type,
                github: type === "github" ? github.trim() : null,
                resumeText: type === "resume" ? resumeText.trim() : null,
            });
            navigate(`/interview/${response.data.id}`);
        } catch (e) {
            toast("Something went wrong starting your interview. Please try again.");
            setLoading(false);
        }
    }

    const handleFile = async (file: File) => {
        if (file.type !== "application/pdf") {
            toast("Please upload a PDF file.");
            return;
        }
        setParsingPdf(true);
        setPdfName(file.name);
        try {
            const text = await extractTextFromPdf(file);
            setResumeText(text);
            toast(`Successfully extracted resume text!`);
        } catch (err) {
            console.error("PDF Parsing error:", err);
            toast("Failed to parse PDF. Please copy and paste text instead.");
        } finally {
            setParsingPdf(false);
        }
    };

    return (
        <main className="flex min-h-screen w-screen items-center justify-center overflow-y-auto py-12 px-6">
            <div className="flex w-full max-w-2xl flex-col items-center">
                <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                    <Mic className="size-3.5 text-primary animate-pulse" />
                    AI-Driven Voice Technical Interview
                </span>

                <h1 className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-center text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
                    SignalForge Interview Kickstart
                </h1>
                <p className="mt-4 max-w-md text-center text-balance text-base text-muted-foreground">
                    Configure your personalized AI interview experience. Get immediate human-like voice feedback and scores matching your stack.
                </p>

                <div className="mt-10 w-full rounded-2xl border border-border bg-card/40 p-6 shadow-xl backdrop-blur-md space-y-6">
                    {/* Candidate Name */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Your Name</label>
                        <Input
                            value={candidateName}
                            placeholder="John Doe"
                            onChange={(e) => setCandidateName(e.target.value)}
                            disabled={loading}
                            className="bg-background/50 border-border focus-visible:ring-ring"
                        />
                    </div>

                    {/* Target Role / JD */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Target Role / Job Description</label>
                        <Input
                            value={targetRole}
                            placeholder="e.g. Senior React Developer or Paste full Job Description"
                            onChange={(e) => setTargetRole(e.target.value)}
                            disabled={loading}
                            className="bg-background/50 border-border focus-visible:ring-ring"
                        />
                    </div>

                    {/* Segmented Selection Toggle */}
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-foreground">Background Source</label>
                        <div className="grid grid-cols-2 gap-2 bg-muted/30 p-1 rounded-xl border border-border">
                            <button
                                type="button"
                                onClick={() => setType("github")}
                                disabled={loading}
                                className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                                    type === "github"
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                }`}
                            >
                                <Github className="size-4" />
                                GitHub Profile
                            </button>
                            <button
                                type="button"
                                onClick={() => setType("resume")}
                                disabled={loading}
                                className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                                    type === "resume"
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                }`}
                            >
                                <FileText className="size-4" />
                                Resume PDF
                            </button>
                        </div>
                    </div>

                    {/* Conditional Input Fields */}
                    {type === "github" ? (
                        <div className="space-y-2 animate-fadeIn">
                            <label className="text-sm font-semibold text-foreground font-mono">GitHub Profile Link</label>
                            <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 p-2 shadow-sm backdrop-blur focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                                <div className="flex items-center pl-2 text-muted-foreground">
                                    <Github className="size-5" />
                                </div>
                                <Input
                                    value={github}
                                    placeholder="https://github.com/your-username"
                                    onChange={(e) => setGithub(e.target.value)}
                                    disabled={loading}
                                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fadeIn">
                            {/* Drag and Drop Zone */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">Upload Resume (PDF)</label>
                                <div
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setDragging(true);
                                    }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setDragging(false);
                                        const file = e.dataTransfer.files[0];
                                        if (file) handleFile(file);
                                    }}
                                    className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer ${
                                        dragging
                                            ? "border-primary bg-primary/5"
                                            : "border-border bg-background/30 hover:bg-background/50"
                                    }`}
                                    onClick={() => {
                                        const input = document.createElement("input");
                                        input.type = "file";
                                        input.accept = ".pdf,application/pdf";
                                        input.onchange = (e: any) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleFile(file);
                                        };
                                        input.click();
                                    }}
                                >
                                    <FileText className={`size-8 mb-2 ${parsingPdf ? "animate-bounce text-primary" : "text-muted-foreground"}`} />
                                    {parsingPdf ? (
                                        <p className="text-sm font-medium text-foreground">Extracting resume info...</p>
                                    ) : pdfName ? (
                                        <p className="text-sm font-medium text-primary">Uploaded: {pdfName}</p>
                                    ) : (
                                        <p className="text-sm font-medium text-muted-foreground text-center">
                                            Drag & drop your resume PDF here, or <span className="text-primary hover:underline">browse</span>
                                        </p>
                                    )}
                                    <p className="text-[10px] text-muted-foreground mt-1">PDF format supported</p>
                                </div>
                            </div>

                            {/* Extracted Text Area */}
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-foreground">Extracted Resume Content (Editable)</label>
                                <textarea
                                    value={resumeText}
                                    rows={6}
                                    placeholder="Extracted details will appear here, or you can paste directly..."
                                    onChange={(e) => setResumeText(e.target.value)}
                                    disabled={loading}
                                    className="flex w-full rounded-xl border border-border bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                    )}

                    {/* Action Button */}
                    <div className="pt-2">
                        <Button
                            disabled={loading || parsingPdf}
                            onClick={onSubmit}
                            size="lg"
                            className="w-full gap-2 rounded-xl py-6 text-base font-semibold transition-all hover:scale-[1.01]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="size-5 animate-spin" />
                                    Preparing your interview...
                                </>
                            ) : (
                                <>
                                    Start personalized interview
                                    <ArrowRight className="size-5" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground text-center">
                    We will analyze your background and request microphone access to start the voice stream.
                </p>
            </div>
        </main>
    );
}
