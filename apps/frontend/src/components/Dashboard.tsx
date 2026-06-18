import { useState, useEffect } from "react";
import { useAuth, useUser, UserButton } from "@clerk/clerk-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router";
import {
    Building2,
    Plus,
    Link,
    Calendar,
    Award,
    CheckCircle2,
    Users,
    Trash2,
    Shield,
    Loader2,
    ArrowRight,
    Github,
    FileText,
    Copy,
    ExternalLink
} from "lucide-react";

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

export function Dashboard() {
    const { isLoaded, userId, getToken } = useAuth();
    const { user } = useUser();
    const navigate = useNavigate();

    // Portal view: "candidate" | "organization"
    const [portal, setPortal] = useState<"candidate" | "organization">("organization");

    // Simulator Roles: "Candidate" | "Recruiter" | "Admin"
    const [simulatedRole, setSimulatedRole] = useState<"Candidate" | "Recruiter" | "Admin">("Candidate");

    // Organization data
    const [teams, setTeams] = useState<any[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<any>(null);
    const [newTeamName, setNewTeamName] = useState("");
    const [loadingTeams, setLoadingTeams] = useState(false);
    const [creatingTeam, setCreatingTeam] = useState(false);

    // Recruiter Jobs & Candidates data
    const [jobs, setJobs] = useState<any[]>([]);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [newJobTitle, setNewJobTitle] = useState("");
    const [newJobDesc, setNewJobDesc] = useState("");
    const [postingJob, setPostingJob] = useState(false);
    const [loadingOrgDetails, setLoadingOrgDetails] = useState(false);

    // Candidate Past Interviews data
    const [pastInterviews, setPastInterviews] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Candidate Practice Mock states
    const [candidateName, setCandidateName] = useState(user?.fullName || "");
    const [targetRole, setTargetRole] = useState("");
    const [bgSource, setBgSource] = useState<"github" | "resume">("github");
    const [githubUrl, setGithubUrl] = useState("");
    const [resumeText, setResumeText] = useState("");
    const [mockDuration, setMockDuration] = useState(20);
    const [startingMock, setStartingMock] = useState(false);

    // Admin state
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [allOrgs, setAllOrgs] = useState<any[]>([]);
    const [loadingAdmin, setLoadingAdmin] = useState(false);

    // Organization Members states
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState("");
    const [newMemberName, setNewMemberName] = useState("");
    const [newMemberRole, setNewMemberRole] = useState<"Candidate" | "Recruiter" | "Admin">("Candidate");
    const [addingMember, setAddingMember] = useState(false);
    const [selectedJobForMember, setSelectedJobForMember] = useState<Record<string, string>>({});
    const [schedulingMember, setSchedulingMember] = useState<Record<string, boolean>>({});

    // Reschedule & Scheduling Modal states
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [modalTargetInterviewId, setModalTargetInterviewId] = useState<string | null>(null);
    const [modalTargetMemberId, setModalTargetMemberId] = useState<string | null>(null);
    const [modalTargetName, setModalTargetName] = useState("");
    const [modalJobId, setModalJobId] = useState("");
    const [modalJobTitle, setModalJobTitle] = useState("");
    const [modalScheduledAt, setModalScheduledAt] = useState("");
    const [modalExpiresAt, setModalExpiresAt] = useState("");
    const [modalDuration, setModalDuration] = useState(20);
    const [savingModal, setSavingModal] = useState(false);

    // Batch Schedule states
    const [batchJobId, setBatchJobId] = useState("");
    const [batchScheduledAt, setBatchScheduledAt] = useState("");
    const [batchExpiresAt, setBatchExpiresAt] = useState("");
    const [batchDuration, setBatchDuration] = useState(20);
    const [batchScheduling, setBatchScheduling] = useState(false);
    const [batchTargetMode, setBatchTargetMode] = useState<"all" | "limit">("all");
    const [batchLimit, setBatchLimit] = useState("10");

    // Recruiter JD upload states
    const [draggingJd, setDraggingJd] = useState(false);
    const [parsingJdPdf, setParsingJdPdf] = useState(false);
    const [jdPdfName, setJdPdfName] = useState("");

    // Candidate Resume upload states
    const [draggingResume, setDraggingResume] = useState(false);
    const [parsingResumePdf, setParsingResumePdf] = useState(false);
    const [resumePdfName, setResumePdfName] = useState("");

    const handleResumeFile = async (file: File) => {
        if (file.type !== "application/pdf") {
            toast.error("Please upload a PDF file.");
            return;
        }
        setParsingResumePdf(true);
        setResumePdfName(file.name);
        try {
            const text = await extractTextFromPdf(file);
            setResumeText(text);
            toast.success(`Successfully extracted resume text!`);
        } catch (err) {
            console.error("PDF Parsing error:", err);
            toast.error("Failed to parse PDF. Please copy and paste text instead.");
        } finally {
            setParsingResumePdf(false);
        }
    };

    const handleJdFile = async (file: File) => {
        if (file.type !== "application/pdf") {
            toast.error("Please upload a PDF file.");
            return;
        }
        setParsingJdPdf(true);
        setJdPdfName(file.name);
        try {
            const text = await extractTextFromPdf(file);
            setNewJobDesc(text);
            toast.success(`Successfully extracted job description text!`);
        } catch (err) {
            console.error("PDF Parsing error:", err);
            toast.error("Failed to parse PDF. Please copy and paste text instead.");
        } finally {
            setParsingJdPdf(false);
        }
    };

    const activeUserId = userId || localStorage.getItem("sf_mock_user");

    // Sync user profile with database on load
    useEffect(() => {
        if (activeUserId) {
            syncUser();
        }
    }, [activeUserId]);

    // Load active portal data
    useEffect(() => {
        if (activeUserId) {
            if (portal === "organization") {
                fetchTeams();
            } else if (portal === "candidate") {
                fetchCandidateHistory();
            }
        }
    }, [activeUserId, portal]);

    // Fetch team details if one is selected
    useEffect(() => {
        if (selectedTeam) {
            fetchOrgDetails(selectedTeam.id);
        }
    }, [selectedTeam]);

    // Load Admin panel data if simulator role is Admin
    useEffect(() => {
        if (simulatedRole === "Admin") {
            fetchAdminData();
        }
    }, [simulatedRole]);

    async function getHeaders() {
        const mockUser = localStorage.getItem("sf_mock_user");
        if (mockUser) {
            return {
                headers: {
                    Authorization: `Bearer mock_${mockUser}`,
                    "Content-Type": "application/json"
                }
            };
        }
        const token = await getToken();
        return {
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json"
            }
        };
    }

    async function syncUser() {
        try {
            const headers = await getHeaders();
            const res = await axios.post(`${BACKEND_URL}/api/v1/user/sync`, {}, headers);
            // Default role sync
            if (res.data.role) {
                setSimulatedRole(res.data.role);
                if (res.data.role === "Candidate") {
                    setPortal("candidate");
                }
            }
        } catch (err) {
            console.error("Failed to sync user:", err);
        }
    }

    useEffect(() => {
        if (simulatedRole === "Candidate" && portal !== "candidate") {
            setPortal("candidate");
        }
    }, [simulatedRole, portal]);

    async function fetchTeams() {
        setLoadingTeams(true);
        try {
            const headers = await getHeaders();
            const res = await axios.get(`${BACKEND_URL}/api/v1/organization/list`, headers);
            setTeams(res.data);
            if (res.data.length > 0 && !selectedTeam) {
                setSelectedTeam(res.data[0]);
            }
        } catch (err: any) {
            console.error("Error fetching teams:", err);
            toast.error(err.response?.data?.error || "Failed to load teams");
        } finally {
            setLoadingTeams(false);
        }
    }

    async function handleCreateTeam() {
        if (!newTeamName.trim()) {
            toast.error("Please enter a team name");
            return;
        }
        setCreatingTeam(true);
        try {
            const headers = await getHeaders();
            const res = await axios.post(
                `${BACKEND_URL}/api/v1/organization/create`,
                { name: newTeamName.trim(), type: "Company" },
                headers
            );
            toast.success("Team registered successfully!");
            setNewTeamName("");
            fetchTeams();
            setSelectedTeam(res.data);
        } catch (err: any) {
            console.error("Error creating team:", err);
            toast.error(err.response?.data?.error || "Authenticated user must have an email address.");
        } finally {
            setCreatingTeam(false);
        }
    }

    async function fetchMembers(orgId: string) {
        setLoadingMembers(true);
        try {
            const headers = await getHeaders();
            const res = await axios.get(`${BACKEND_URL}/api/v1/organization/${orgId}/members`, headers);
            setMembers(res.data);
        } catch (err) {
            console.error("Error fetching members:", err);
        } finally {
            setLoadingMembers(false);
        }
    }

    async function fetchOrgDetails(orgId: string) {
        setLoadingOrgDetails(true);
        try {
            const headers = await getHeaders();
            const [jobsRes, candidatesRes] = await Promise.all([
                axios.get(`${BACKEND_URL}/api/v1/organization/${orgId}/jobs`, headers),
                axios.get(`${BACKEND_URL}/api/v1/organization/${orgId}/candidates`, headers)
            ]);
            setJobs(jobsRes.data);
            setCandidates(candidatesRes.data);
            fetchMembers(orgId);
        } catch (err: any) {
            console.error("Error fetching org details:", err);
            toast.error("Failed to load organization details");
        } finally {
            setLoadingOrgDetails(false);
        }
    }

    async function handleAddMember() {
        if (!selectedTeam) return;
        if (!newMemberEmail.trim()) {
            toast.error("Please enter member email address");
            return;
        }
        setAddingMember(true);
        try {
            const headers = await getHeaders();
            await axios.post(
                `${BACKEND_URL}/api/v1/organization/${selectedTeam.id}/members/add`,
                {
                    email: newMemberEmail.trim(),
                    name: newMemberName.trim() || undefined,
                    role: newMemberRole
                },
                headers
            );
            toast.success("Member added to team successfully!");
            setNewMemberEmail("");
            setNewMemberName("");
            setNewMemberRole("Candidate");
            fetchMembers(selectedTeam.id);
        } catch (err: any) {
            console.error("Error adding member:", err);
            toast.error(err.response?.data?.error || "Failed to add member");
        } finally {
            setAddingMember(false);
        }
    }

    async function handleScheduleMember(memberId: string) {
        if (!selectedTeam) return;
        const jobId = selectedJobForMember[memberId];
        if (!jobId) {
            toast.error("Please select a job role first");
            return;
        }
        const member = members.find(m => m.id === memberId);
        const job = jobs.find(j => j.id === jobId);
        
        setModalTargetInterviewId(null);
        setModalTargetMemberId(memberId);
        setModalTargetName(member?.name || "Candidate");
        setModalJobId(jobId);
        setModalJobTitle(job?.title || "Role");
        setModalScheduledAt("");
        setModalExpiresAt("");
        setModalDuration(20);
        setIsScheduleModalOpen(true);
    }

    async function handleSaveModalSchedule() {
        setSavingModal(true);
        try {
            const headers = await getHeaders();
            if (modalTargetInterviewId) {
                // Rescheduling existing interview
                await axios.post(
                    `${BACKEND_URL}/api/v1/interview/${modalTargetInterviewId}/reschedule`,
                    {
                        scheduledAt: modalScheduledAt || null,
                        expiresAt: modalExpiresAt || null,
                        duration: modalDuration
                    },
                    headers
                );
                toast.success("Interview rescheduled successfully!");
            } else if (modalTargetMemberId) {
                // Scheduling new interview for member
                const res = await axios.post(
                    `${BACKEND_URL}/api/v1/organization/${selectedTeam.id}/schedule-member`,
                    {
                        memberId: modalTargetMemberId,
                        jobId: modalJobId,
                        duration: modalDuration,
                        scheduledAt: modalScheduledAt || null,
                        expiresAt: modalExpiresAt || null
                    },
                    headers
                );
                try {
                    await navigator.clipboard.writeText(res.data.link);
                    toast.success(`Interview scheduled! Link copied to clipboard: ${res.data.link}`, {
                        duration: 6000
                    });
                } catch (clipErr) {
                    console.warn("Clipboard write blocked:", clipErr);
                    toast.success(`Interview scheduled! Link: ${res.data.link}`, {
                        duration: 8000
                    });
                }
            }
            setIsScheduleModalOpen(false);
            if (selectedTeam) {
                fetchOrgDetails(selectedTeam.id);
            }
        } catch (err: any) {
            console.error("Error saving schedule:", err);
            toast.error(err.response?.data?.error || "Failed to save schedule");
        } finally {
            setSavingModal(false);
        }
    }

    async function handleBatchSchedule() {
        if (!selectedTeam) return;
        if (!batchJobId) {
            toast.error("Please select a job role first");
            return;
        }
        setBatchScheduling(true);
        try {
            const headers = await getHeaders();
            const limitVal = batchTargetMode === "limit" ? (parseInt(batchLimit) || 10) : undefined;
            const res = await axios.post(
                `${BACKEND_URL}/api/v1/organization/${selectedTeam.id}/schedule-all`,
                {
                    jobId: batchJobId,
                    duration: batchDuration,
                    scheduledAt: batchScheduledAt || null,
                    expiresAt: batchExpiresAt || null,
                    limit: limitVal
                },
                headers
            );
            toast.success(`Successfully batch scheduled interviews for ${res.data.count} candidates!`);
            setBatchJobId("");
            setBatchScheduledAt("");
            setBatchExpiresAt("");
            fetchOrgDetails(selectedTeam.id);
        } catch (err: any) {
            console.error("Error batch scheduling:", err);
            toast.error(err.response?.data?.error || "Failed to batch schedule interviews");
        } finally {
            setBatchScheduling(false);
        }
    }

    async function handleDeleteTeam() {
        if (!selectedTeam) return;
        if (!confirm(`Are you sure you want to delete the team "${selectedTeam.name}"? This will disconnect all members and remove all job postings and candidate histories permanently.`)) {
            return;
        }
        try {
            const headers = await getHeaders();
            await axios.delete(`${BACKEND_URL}/api/v1/organization/${selectedTeam.id}`, headers);
            toast.success("Team deleted successfully!");
            setSelectedTeam(null);
            fetchTeams();
        } catch (err: any) {
            console.error("Error deleting team:", err);
            toast.error(err.response?.data?.error || "Failed to delete team");
        }
    }

    async function handleDeleteJob(jobId: string) {
        if (!selectedTeam) return;
        if (!confirm("Are you sure you want to delete this job role? This will also delete all scheduled and past candidate interviews associated with this job role permanently.")) {
            return;
        }
        try {
            const headers = await getHeaders();
            await axios.delete(`${BACKEND_URL}/api/v1/organization/${selectedTeam.id}/jobs/${jobId}`, headers);
            toast.success("Job role deleted successfully!");
            fetchOrgDetails(selectedTeam.id);
        } catch (err: any) {
            console.error("Error deleting job role:", err);
            toast.error(err.response?.data?.error || "Failed to delete job role");
        }
    }

    async function handlePostJob() {
        if (!newJobTitle.trim() || !newJobDesc.trim()) {
            toast.error("Job title and description are required");
            return;
        }
        setPostingJob(true);
        try {
            const headers = await getHeaders();
            await axios.post(
                `${BACKEND_URL}/api/v1/organization/${selectedTeam.id}/jobs`,
                {
                    title: newJobTitle.trim(),
                    description: newJobDesc.trim()
                },
                headers
            );
            toast.success("Job posting created successfully!");
            setNewJobTitle("");
            setNewJobDesc("");
            fetchOrgDetails(selectedTeam.id);
        } catch (err: any) {
            console.error("Error posting job:", err);
            toast.error(err.response?.data?.error || "Failed to create job template");
        } finally {
            setPostingJob(false);
        }
    }

    async function fetchCandidateHistory() {
        setLoadingHistory(true);
        try {
            const headers = await getHeaders();
            const res = await axios.get(`${BACKEND_URL}/api/v1/candidate/interviews`, headers);
            setPastInterviews(res.data);
        } catch (err: any) {
            console.error("Error fetching history:", err);
            toast.error("Failed to load interview history");
        } finally {
            setLoadingHistory(false);
        }
    }

    async function handleDeleteInterview(interviewId: string) {
        if (!confirm("Are you sure you want to delete this interview from your history? This action cannot be undone.")) {
            return;
        }
        try {
            const headers = await getHeaders();
            await axios.delete(`${BACKEND_URL}/api/v1/candidate/interview/${interviewId}`, headers);
            toast.success("Interview history deleted successfully!");
            fetchCandidateHistory();
        } catch (err: any) {
            console.error("Error deleting interview history:", err);
            toast.error(err.response?.data?.error || "Failed to delete interview history");
        }
    }

    async function startPracticeMock() {
        if (!candidateName.trim()) {
            toast.error("Please enter your name");
            return;
        }
        if (!targetRole.trim()) {
            toast.error("Please specify a target role / job description");
            return;
        }
        if (bgSource === "github" && !githubUrl.trim()) {
            toast.error("Please enter a GitHub profile link");
            return;
        }
        if (bgSource === "resume" && !resumeText.trim()) {
            toast.error("Please paste your resume details");
            return;
        }

        setStartingMock(true);
        try {
            const headers = await getHeaders();
            const res = await axios.post(
                `${BACKEND_URL}/api/v1/pre-interview`,
                {
                    candidateName: candidateName.trim(),
                    targetRole: targetRole.trim(),
                    type: bgSource,
                    github: bgSource === "github" ? githubUrl.trim() : null,
                    resumeText: bgSource === "resume" ? resumeText.trim() : null,
                    duration: mockDuration
                },
                headers
            );
            navigate(`/interview/${res.data.id}`);
        } catch (err: any) {
            console.error("Error starting practice mock:", err);
            toast.error("Failed to start technical interview session");
        } finally {
            setStartingMock(false);
        }
    }

    async function fetchAdminData() {
        setLoadingAdmin(true);
        try {
            const headers = await getHeaders();
            const [usersRes, orgsRes] = await Promise.all([
                axios.get(`${BACKEND_URL}/api/v1/admin/users`, headers),
                axios.get(`${BACKEND_URL}/api/v1/admin/organizations`, headers)
            ]);
            setAllUsers(usersRes.data);
            setAllOrgs(orgsRes.data);
        } catch (err: any) {
            console.error("Error loading admin data:", err);
        } finally {
            setLoadingAdmin(false);
        }
    }

    async function handleUpdateRole(userToUpdateId: string, role: string) {
        try {
            const headers = await getHeaders();
            await axios.post(`${BACKEND_URL}/api/v1/admin/user/${userToUpdateId}/role`, { role }, headers);
            toast.success("User role updated!");
            fetchAdminData();
        } catch (err: any) {
            toast.error("Failed to update user role");
        }
    }

    async function handleDeleteOrg(orgId: string) {
        if (!confirm("Are you sure you want to delete this organization? All linked job postings will be removed.")) return;
        try {
            const headers = await getHeaders();
            await axios.delete(`${BACKEND_URL}/api/v1/admin/organization/${orgId}`, headers);
            toast.success("Organization deleted!");
            fetchAdminData();
        } catch (err: any) {
            toast.error("Failed to delete organization");
        }
    }

    async function copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Invite link copied to clipboard!");
        } catch (clipErr) {
            console.warn("Clipboard write blocked:", clipErr);
            toast.success(`Invite link: ${text}`, {
                duration: 8000
            });
        }
    }

    if (!isLoaded && !localStorage.getItem("sf_mock_user")) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-black">
                <Loader2 className="size-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white selection:bg-primary selection:text-white">
            {/* Dev Mode Simulator Bar */}
            <div className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur px-6 py-2.5 flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-1.5 font-mono">
                    <Shield className="size-3.5 text-yellow-500 animate-pulse" />
                    <span>SIMULATED ROLE:</span>
                    <span className="text-white font-bold">{simulatedRole.toUpperCase()}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setSimulatedRole("Candidate"); setPortal("candidate"); }}
                        className={`px-2.5 py-1 rounded transition-all font-mono ${simulatedRole === "Candidate" ? "bg-zinc-800 text-yellow-400 font-bold" : "hover:bg-zinc-900"}`}
                    >
                        Candidate
                    </button>
                    <button
                        onClick={() => { setSimulatedRole("Recruiter"); setPortal("organization"); }}
                        className={`px-2.5 py-1 rounded transition-all font-mono ${simulatedRole === "Recruiter" ? "bg-zinc-800 text-yellow-400 font-bold" : "hover:bg-zinc-900"}`}
                    >
                        Recruiter
                    </button>
                    <button
                        onClick={() => { setSimulatedRole("Admin"); setPortal("organization"); }}
                        className={`px-2.5 py-1 rounded transition-all font-mono ${simulatedRole === "Admin" ? "bg-zinc-800 text-yellow-400 font-bold" : "hover:bg-zinc-900"}`}
                    >
                        Admin
                    </button>
                </div>
            </div>

            {/* Header */}
            <header className="border-b border-zinc-900 bg-zinc-950/40 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
                    <div className="h-7 w-7 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-sm">S</div>
                    <span className="text-lg font-bold tracking-tight text-white font-sans">SignalForge</span>
                </div>
                <div className="flex items-center gap-4">
                    {simulatedRole === "Admin" && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-zinc-800 text-zinc-400 hover:text-white"
                            onClick={() => {
                                setPortal("organization");
                            }}
                        >
                            Global Console
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-300 hover:text-white"
                        onClick={() => navigate("/")}
                    >
                        Dashboard
                    </Button>
                    {localStorage.getItem("sf_mock_user") ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 font-mono text-[10px]"
                            onClick={() => {
                                localStorage.removeItem("sf_mock_user");
                                window.location.href = "/";
                            }}
                        >
                            [Exit Bypass]
                        </Button>
                    ) : (
                        <UserButton afterSignOutUrl="/" />
                    )}
                </div>
            </header>

            {/* Main Area */}
            <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
                {/* User Welcome Row */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-white font-sans">
                            Welcome, {user?.firstName || "user"}
                        </h1>
                        <p className="text-sm text-zinc-400 mt-1 font-medium">
                            Monitor your candidate history or manage scheduled college/corporate roles.
                        </p>
                    </div>

                    {/* Portal Switcher */}
                    {simulatedRole !== "Candidate" && (
                        <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl flex items-center gap-1 shadow-inner">
                            <button
                                onClick={() => setPortal("candidate")}
                                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${portal === "candidate"
                                        ? "bg-white text-black shadow-sm"
                                        : "text-zinc-400 hover:text-white"
                                    }`}
                            >
                                Candidate Portal
                            </button>
                            <button
                                onClick={() => setPortal("organization")}
                                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${portal === "organization"
                                        ? "bg-white text-black shadow-sm"
                                        : "text-zinc-400 hover:text-white"
                                    }`}
                            >
                                Organization Portal
                            </button>
                        </div>
                    )}
                </div>

                <hr className="border-zinc-900" />

                {/* Simulated Portal Content */}
                {portal === "organization" && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                        {/* Sidebar (left 4 columns) */}
                        <div className="md:col-span-4 space-y-6">
                            {/* Your Teams list */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 space-y-4">
                                <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold font-mono tracking-wider uppercase">
                                    <Building2 className="size-4 text-primary" />
                                    <span>Your Teams</span>
                                </div>
                                {loadingTeams ? (
                                    <div className="flex items-center justify-center py-4">
                                        <Loader2 className="size-5 animate-spin text-zinc-600" />
                                    </div>
                                ) : teams.length === 0 ? (
                                    <p className="text-xs text-zinc-500">No organizations yet.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {teams.map((team) => (
                                            <button
                                                key={team.id}
                                                onClick={() => setSelectedTeam(team)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-all ${selectedTeam?.id === team.id
                                                        ? "bg-zinc-800 text-white font-semibold border border-zinc-700"
                                                        : "text-zinc-400 hover:text-white hover:bg-zinc-900/40"
                                                    }`}
                                            >
                                                {team.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Create/Register team */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 space-y-4">
                                <div className="text-zinc-400 text-xs font-bold font-mono tracking-wider uppercase">
                                    Register Team
                                </div>
                                <div className="space-y-3">
                                    <Input
                                        placeholder="Enter Team Name"
                                        value={newTeamName}
                                        onChange={(e) => setNewTeamName(e.target.value)}
                                        className="bg-zinc-950 border-zinc-800 focus:border-zinc-700 placeholder:text-zinc-600 text-xs py-5 rounded-lg"
                                    />
                                    <button
                                        onClick={handleCreateTeam}
                                        disabled={creatingTeam}
                                        className="w-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                                    >
                                        {creatingTeam ? (
                                            <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                            <Plus className="size-3.5" />
                                        )}
                                        Create Team
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Main section (right 8 columns) */}
                        <div className="md:col-span-8">
                            {!selectedTeam ? (
                                <div className="border border-zinc-800 border-dashed rounded-xl p-16 flex flex-col items-center justify-center text-center space-y-4 bg-zinc-950/20 backdrop-blur-sm">
                                    <div className="h-12 w-12 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-500">
                                        <Building2 className="size-6" />
                                    </div>
                                    <h3 className="text-base font-bold text-white">No organization selected or registered</h3>
                                    <p className="text-xs text-zinc-500 max-w-xs">
                                        Please create or choose a team from the sidebar to start scheduling technical interviews.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="flex justify-between items-center bg-zinc-950/60 p-4 rounded-xl border border-zinc-900">
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{selectedTeam.name}</h2>
                                            <p className="text-[10px] text-zinc-500 font-medium font-mono uppercase tracking-wider">{selectedTeam.type || "Company"}</p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-400 hover:text-red-300 hover:bg-red-950/20 border border-transparent hover:border-red-900/50 flex items-center gap-1.5"
                                            onClick={handleDeleteTeam}
                                        >
                                            <Trash2 className="size-4" />
                                            Delete Team
                                        </Button>
                                    </div>
                                    {/* Simulated Admin View */}
                                    {simulatedRole === "Admin" && (
                                        <div className="rounded-xl border border-yellow-800/40 bg-yellow-950/10 p-5 space-y-4">
                                            <div className="flex items-center gap-2 text-yellow-500 text-xs font-bold font-mono tracking-wider uppercase">
                                                <Shield className="size-4" />
                                                <span>Admin System Console</span>
                                            </div>
                                            {loadingAdmin ? (
                                                <div className="flex justify-center"><Loader2 className="size-6 animate-spin text-yellow-600" /></div>
                                            ) : (
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                    {/* Users List */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-bold text-zinc-300">Registered Users ({allUsers.length})</h4>
                                                        <div className="max-h-52 overflow-y-auto border border-zinc-800 rounded-lg p-2 bg-black space-y-2">
                                                            {allUsers.map((u) => (
                                                                <div key={u.id} className="flex justify-between items-center text-[11px] p-1.5 border-b border-zinc-900">
                                                                    <div className="truncate pr-2">
                                                                        <div className="font-semibold text-white truncate">{u.name}</div>
                                                                        <div className="text-zinc-500 truncate">{u.email}</div>
                                                                    </div>
                                                                    <select
                                                                        value={u.role}
                                                                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                                                        className="bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 text-[10px]"
                                                                    >
                                                                        <option value="Candidate">Candidate</option>
                                                                        <option value="Recruiter">Recruiter</option>
                                                                        <option value="Admin">Admin</option>
                                                                    </select>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Orgs List */}
                                                    <div className="space-y-2">
                                                        <h4 className="text-xs font-bold text-zinc-300">Organizations ({allOrgs.length})</h4>
                                                        <div className="max-h-52 overflow-y-auto border border-zinc-800 rounded-lg p-2 bg-black space-y-2">
                                                            {allOrgs.map((o) => (
                                                                <div key={o.id} className="flex justify-between items-center text-[11px] p-1.5 border-b border-zinc-900">
                                                                    <div className="truncate pr-2">
                                                                        <div className="font-semibold text-white truncate">{o.name}</div>
                                                                        <div className="text-zinc-500">{o._count?.members || 0} members • {o._count?.jobs || 0} jobs</div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleDeleteOrg(o.id)}
                                                                        className="text-red-500 hover:text-red-400 p-1 rounded"
                                                                    >
                                                                        <Trash2 className="size-3.5" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Recruiter: Schedule Interview / Job Post form */}
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 space-y-4">
                                        <div className="text-sm font-bold text-white">Create New Interview Schedule</div>
                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400 font-semibold">Job Title / Target Role</label>
                                                <Input
                                                    placeholder="e.g. Senior Frontend Engineer"
                                                    value={newJobTitle}
                                                    onChange={(e) => setNewJobTitle(e.target.value)}
                                                    className="bg-zinc-950 border-zinc-800 text-xs py-4"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs text-zinc-400 font-semibold">Job Description / Requirements</label>

                                                {/* Drag and Drop Zone for JD */}
                                                <div
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        setDraggingJd(true);
                                                    }}
                                                    onDragLeave={() => setDraggingJd(false)}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        setDraggingJd(false);
                                                        const file = e.dataTransfer.files[0];
                                                        if (file) handleJdFile(file);
                                                    }}
                                                    onClick={() => {
                                                        const input = document.createElement("input");
                                                        input.type = "file";
                                                        input.accept = ".pdf,application/pdf";
                                                        input.onchange = (e: any) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleJdFile(file);
                                                        };
                                                        input.click();
                                                    }}
                                                    className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-4 transition-all cursor-pointer ${
                                                        draggingJd
                                                            ? "border-primary bg-primary/5"
                                                            : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900/50"
                                                    }`}
                                                >
                                                    <FileText className={`size-6 mb-1 ${parsingJdPdf ? "animate-bounce text-primary" : "text-zinc-500"}`} />
                                                    {parsingJdPdf ? (
                                                        <p className="text-[10px] font-medium text-white">Extracting JD requirements...</p>
                                                    ) : jdPdfName ? (
                                                        <p className="text-[10px] font-medium text-primary">Uploaded: {jdPdfName}</p>
                                                    ) : (
                                                        <p className="text-[10px] text-zinc-500 text-center">
                                                            Drag & drop JD PDF here, or <span className="text-primary hover:underline font-semibold">browse</span>
                                                        </p>
                                                    )}
                                                </div>

                                                <textarea
                                                    placeholder="Or paste detailed requirements directly. Candidate will be interviewed exactly matching this JD."
                                                    value={newJobDesc}
                                                    onChange={(e) => setNewJobDesc(e.target.value)}
                                                    rows={4}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs focus:border-zinc-700 outline-none text-white resize-none"
                                                />
                                            </div>
                                            <button
                                                onClick={handlePostJob}
                                                disabled={postingJob}
                                                className="bg-white hover:bg-zinc-200 text-black text-xs font-semibold py-2.5 px-6 rounded-lg flex items-center justify-center gap-1.5 transition-all ml-auto"
                                            >
                                                {postingJob ? (
                                                    <Loader2 className="size-3.5 animate-spin" />
                                                ) : (
                                                    <Plus className="size-3.5" />
                                                )}
                                                Add Schedule
                                            </button>
                                        </div>
                                    </div>

                                    {/* Recruiter: Bulk / Batch Scheduling Card */}
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 space-y-4">
                                        <div className="text-sm font-bold text-white flex items-center gap-2">
                                            <Users className="size-4 text-primary" />
                                            <span>Bulk / Batch Schedule Technical Interviews</span>
                                        </div>
                                        <p className="text-xs text-zinc-400">
                                            Schedule the same job role interview for multiple candidates at once.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400 font-semibold">Select Job Role</label>
                                                <select
                                                    value={batchJobId}
                                                    onChange={(e) => setBatchJobId(e.target.value)}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-300 outline-none focus:border-zinc-700 h-10"
                                                >
                                                    <option value="">-- Choose Job Role --</option>
                                                    {jobs.map((job) => (
                                                        <option key={job.id} value={job.id}>
                                                            {job.title}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400 font-semibold">Target Candidates</label>
                                                <div className="flex gap-4 items-center h-10">
                                                    <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer font-medium">
                                                        <input
                                                            type="radio"
                                                            name="batchTarget"
                                                            checked={batchTargetMode === "all"}
                                                            onChange={() => setBatchTargetMode("all")}
                                                            className="accent-primary"
                                                        />
                                                        All Candidates
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer font-medium">
                                                        <input
                                                            type="radio"
                                                            name="batchTarget"
                                                            checked={batchTargetMode === "limit"}
                                                            onChange={() => setBatchTargetMode("limit")}
                                                            className="accent-primary"
                                                        />
                                                        Limit count
                                                    </label>
                                                    {batchTargetMode === "limit" && (
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            placeholder="10"
                                                            value={batchLimit}
                                                            onChange={(e) => setBatchLimit(e.target.value)}
                                                            className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white outline-none focus:border-zinc-700 h-7"
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400 font-semibold">Scheduled Start Time (Optional)</label>
                                                <input
                                                    type="datetime-local"
                                                    value={batchScheduledAt}
                                                    onChange={(e) => setBatchScheduledAt(e.target.value)}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-zinc-700 h-10"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400 font-semibold">Invitation Expiration Time (Optional)</label>
                                                <input
                                                    type="datetime-local"
                                                    value={batchExpiresAt}
                                                    onChange={(e) => setBatchExpiresAt(e.target.value)}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-xs text-white outline-none focus:border-zinc-700 h-10"
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-xs text-zinc-400 font-semibold block">Max Duration</label>
                                                <div className="flex gap-2">
                                                    {[20, 22, 25].map((d) => (
                                                        <button
                                                            key={d}
                                                            type="button"
                                                            onClick={() => setBatchDuration(d)}
                                                            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all h-10 ${
                                                                batchDuration === d
                                                                    ? "bg-white text-black border-white"
                                                                    : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                                                            }`}
                                                        >
                                                            {d} min
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <button
                                                onClick={handleBatchSchedule}
                                                disabled={batchScheduling}
                                                className="bg-white hover:bg-zinc-200 text-black text-xs font-semibold py-2.5 px-6 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                                            >
                                                {batchScheduling ? (
                                                    <Loader2 className="size-3.5 animate-spin" />
                                                ) : (
                                                    <Users className="size-3.5" />
                                                )}
                                                Assign & Schedule for Candidates
                                            </button>
                                        </div>
                                    </div>

                                    {/* Recruiter: Team Members & Scheduling */}
                                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-6 space-y-6">
                                        <div className="flex justify-between items-center">
                                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                                <Users className="size-4 text-primary" />
                                                Team Members ({members.length})
                                            </div>
                                        </div>

                                        {/* Form to Add Member */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-zinc-900/30 p-4 rounded-xl border border-zinc-800/80">
                                            <div className="sm:col-span-4 space-y-1">
                                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Member Email</label>
                                                <Input
                                                    placeholder="candidate@email.com"
                                                    value={newMemberEmail}
                                                    onChange={(e) => setNewMemberEmail(e.target.value)}
                                                    className="bg-zinc-950 border-zinc-800 text-xs py-3.5 h-8 focus:border-zinc-700"
                                                />
                                            </div>
                                            <div className="sm:col-span-3 space-y-1">
                                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Full Name (Optional)</label>
                                                <Input
                                                    placeholder="John Doe"
                                                    value={newMemberName}
                                                    onChange={(e) => setNewMemberName(e.target.value)}
                                                    className="bg-zinc-950 border-zinc-800 text-xs py-3.5 h-8 focus:border-zinc-700"
                                                />
                                            </div>
                                            <div className="sm:col-span-3 space-y-1">
                                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Role</label>
                                                <select
                                                    value={newMemberRole}
                                                    onChange={(e) => setNewMemberRole(e.target.value as any)}
                                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 h-8 text-zinc-300 text-xs outline-none focus:border-zinc-700"
                                                >
                                                    <option value="Candidate">Candidate (Default)</option>
                                                    <option value="Recruiter">Recruiter</option>
                                                    <option value="Admin">Admin</option>
                                                </select>
                                            </div>
                                            <div className="sm:col-span-2 flex items-end">
                                                <Button
                                                    onClick={handleAddMember}
                                                    disabled={addingMember}
                                                    size="sm"
                                                    className="w-full text-xs bg-white hover:bg-zinc-200 text-black font-semibold h-8 rounded-lg"
                                                >
                                                    {addingMember ? (
                                                        <Loader2 className="size-3 animate-spin" />
                                                    ) : (
                                                        <Plus className="size-3 mr-1" />
                                                    )}
                                                    Add
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Members List & Scheduling Action */}
                                        {loadingMembers ? (
                                            <div className="flex justify-center py-4"><Loader2 className="size-6 animate-spin text-zinc-700" /></div>
                                        ) : members.length === 0 ? (
                                            <div className="text-center text-xs text-zinc-500 py-2">
                                                No members added to this team yet. Use the form above to invite candidate emails.
                                            </div>
                                        ) : (
                                            <div className="border border-zinc-800 rounded-lg overflow-hidden bg-black/20 font-sans">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-zinc-800 bg-zinc-900/40 text-zinc-400">
                                                            <th className="p-3 font-semibold">Name / Email</th>
                                                            <th className="p-3 font-semibold">Schedule Technical Interview</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-900">
                                                        {members.map((member) => (
                                                            <tr key={member.id} className="hover:bg-zinc-900/10">
                                                                <td className="p-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="font-semibold text-white truncate max-w-xs">{member.name || "Candidate"}</div>
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                                                                            member.role === "Admin"
                                                                                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                                                : member.role === "Recruiter"
                                                                                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                                                                    : "bg-zinc-800 text-zinc-400 border border-zinc-700/50"
                                                                        }`}>
                                                                            {member.role || "Candidate"}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-zinc-500 truncate max-w-xs font-mono">{member.email}</div>
                                                                </td>
                                                                <td className="p-3">
                                                                    {jobs.length === 0 ? (
                                                                        <span className="text-[10px] text-zinc-500">Create a job schedule above to select a role</span>
                                                                    ) : (
                                                                        <div className="flex items-center gap-2">
                                                                            <select
                                                                                value={selectedJobForMember[member.id] || ""}
                                                                                onChange={(e) => setSelectedJobForMember(prev => ({ ...prev, [member.id]: e.target.value }))}
                                                                                className="bg-zinc-995 border border-zinc-800 rounded px-2 py-1 text-zinc-300 text-[10px] h-7 outline-none focus:border-zinc-700 flex-1 max-w-[180px]"
                                                                            >
                                                                                <option value="">-- Choose Job Role --</option>
                                                                                {jobs.map((job) => (
                                                                                    <option key={job.id} value={job.id}>
                                                                                        {job.title}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                            <Button
                                                                                onClick={() => handleScheduleMember(member.id)}
                                                                                disabled={schedulingMember[member.id]}
                                                                                size="sm"
                                                                                className="text-[10px] px-2.5 py-1 h-7 bg-zinc-850 hover:bg-zinc-800 text-white font-semibold flex items-center gap-1 transition-all rounded-md border border-zinc-800"
                                                                            >
                                                                                {schedulingMember[member.id] ? (
                                                                                    <Loader2 className="size-3 animate-spin" />
                                                                                ) : (
                                                                                    <Link className="size-3" />
                                                                                )}
                                                                                Schedule
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Active Job Schedules & Invites */}
                                    <div className="space-y-4">
                                        <h3 className="text-base font-bold text-white">Active Interview Schedules</h3>
                                        {loadingOrgDetails ? (
                                            <div className="flex justify-center py-6"><Loader2 className="size-6 animate-spin text-zinc-700" /></div>
                                        ) : jobs.length === 0 ? (
                                            <div className="rounded-xl border border-zinc-800 p-6 text-center text-xs text-zinc-500">
                                                No job schedules created yet. Use the scheduler form above.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-4">
                                                {jobs.map((job) => {
                                                    const inviteUrl = `${window.location.origin}/invite/job/${job.id}`;
                                                    return (
                                                        <div key={job.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                                            <div className="space-y-1">
                                                                <h4 className="text-sm font-bold text-white">{job.title}</h4>
                                                                <p className="text-xs text-zinc-400 line-clamp-1 max-w-lg">{job.description}</p>
                                                                <div className="flex items-center gap-1 text-[10px] text-zinc-500 pt-1 font-mono">
                                                                    <span>Invite link active • 20 min limit</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2 w-full md:w-auto">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="border-zinc-800 text-zinc-400 hover:text-white flex items-center gap-1.5 text-xs py-2 h-9 flex-1 md:flex-initial"
                                                                    onClick={() => copyToClipboard(inviteUrl)}
                                                                >
                                                                    <Copy className="size-3.5" />
                                                                    Copy Invite
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="border-zinc-800 text-zinc-400 hover:text-white flex items-center gap-1.5 text-xs py-2 h-9 flex-1 md:flex-initial"
                                                                    onClick={() => window.open(inviteUrl, "_blank")}
                                                                >
                                                                    <ExternalLink className="size-3.5" />
                                                                    Test Invite
                                                                </Button>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="border-zinc-850 hover:bg-red-950/20 text-red-400 hover:text-red-300 flex items-center justify-center py-2 h-9 px-3 rounded-lg transition-all"
                                                                    onClick={() => handleDeleteJob(job.id)}
                                                                    title="Delete Job Role"
                                                                >
                                                                    <Trash2 className="size-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Candidates scoreboard list */}
                                    <div className="space-y-4">
                                        <h3 className="text-base font-bold text-white">Candidates Scoreboard</h3>
                                        {loadingOrgDetails ? (
                                            <div className="flex justify-center py-6"><Loader2 className="size-6 animate-spin text-zinc-700" /></div>
                                        ) : candidates.length === 0 ? (
                                            <div className="rounded-xl border border-zinc-800 p-6 text-center text-xs text-zinc-500">
                                                No candidates have completed scheduled sessions yet.
                                            </div>
                                        ) : (
                                            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
                                                <table className="w-full text-left text-xs border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-400 font-mono text-[10px] uppercase">
                                                            <th className="p-4">Candidate Name</th>
                                                            <th className="p-4">Target Job</th>
                                                            <th className="p-4">Duration</th>
                                                            <th className="p-4">Date</th>
                                                            <th className="p-4 text-center">Score</th>
                                                            <th className="p-4 text-center">Report</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-zinc-900">
                                                        {candidates.map((c) => (
                                                            <tr key={c.id} className="hover:bg-zinc-900/10">
                                                                <td className="p-4 font-semibold text-white">
                                                                    <div>{c.candidateName || c.user?.name || "Candidate"}</div>
                                                                    {c.scheduledAt && (
                                                                        <div className="text-[9px] text-zinc-500 font-mono mt-0.5">
                                                                            Sched: {new Date(c.scheduledAt).toLocaleString()}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="p-4 text-zinc-300">{c.job?.title || c.targetRole || "Interview"}</td>
                                                                <td className="p-4 text-zinc-400">{c.duration || 20}m</td>
                                                                <td className="p-4 text-zinc-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                                                                <td className="p-4 text-center">
                                                                    {c.status === "Done" ? (
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${c.score >= 8 ? "bg-green-500/10 text-green-400" : c.score >= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                                                            {c.score}/10
                                                                        </span>
                                                                    ) : c.expiresAt && new Date() > new Date(c.expiresAt) ? (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                                                            Expired
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                                                                            Pending
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="p-4 text-center">
                                                                    {c.status === "Done" ? (
                                                                        <button
                                                                            onClick={() => navigate(`/result/${c.id}`)}
                                                                            className="text-primary hover:underline font-medium text-xs flex items-center gap-1 mx-auto"
                                                                        >
                                                                            View
                                                                            <ExternalLink className="size-3" />
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => {
                                                                                setModalTargetInterviewId(c.id);
                                                                                setModalTargetMemberId(null);
                                                                                setModalTargetName(c.candidateName || c.user?.name || "Candidate");
                                                                                setModalJobId(c.jobId || "");
                                                                                setModalJobTitle(c.job?.title || c.targetRole || "Interview");
                                                                                setModalScheduledAt(c.scheduledAt ? new Date(c.scheduledAt).toISOString().slice(0, 16) : "");
                                                                                setModalExpiresAt(c.expiresAt ? new Date(c.expiresAt).toISOString().slice(0, 16) : "");
                                                                                setModalDuration(c.duration);
                                                                                setIsScheduleModalOpen(true);
                                                                            }}
                                                                            className="text-yellow-400 hover:underline font-medium text-xs flex items-center gap-1 mx-auto"
                                                                        >
                                                                            Reschedule
                                                                            <Calendar className="size-3" />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {portal === "candidate" && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
                        {/* Candidate Practice Mock Config Sidebar */}
                        <div className="md:col-span-4 space-y-6">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 space-y-5">
                                <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold font-mono tracking-wider uppercase">
                                    <Award className="size-4 text-primary" />
                                    <span>Practice Mock</span>
                                </div>
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] text-zinc-400 font-semibold">Your Full Name</label>
                                        <Input
                                            placeholder="Enter your name"
                                            value={candidateName}
                                            onChange={(e) => setCandidateName(e.target.value)}
                                            className="bg-zinc-950 border-zinc-800 text-xs py-4"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] text-zinc-400 font-semibold">Target Role / Job Spec</label>
                                        <Input
                                            placeholder="e.g. Senior Frontend Developer"
                                            value={targetRole}
                                            onChange={(e) => setTargetRole(e.target.value)}
                                            className="bg-zinc-950 border-zinc-800 text-xs py-4"
                                        />
                                    </div>

                                    {/* Source selector */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] text-zinc-400 font-semibold font-mono">Background source</label>
                                        <div className="grid grid-cols-2 gap-1.5 bg-zinc-900/50 p-1 border border-zinc-800 rounded-lg">
                                            <button
                                                onClick={() => setBgSource("github")}
                                                className={`py-1.5 text-[10px] font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${bgSource === "github" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                                            >
                                                <Github className="size-3" />
                                                Github
                                            </button>
                                            <button
                                                onClick={() => setBgSource("resume")}
                                                className={`py-1.5 text-[10px] font-semibold rounded-md flex items-center justify-center gap-1.5 transition-all ${bgSource === "resume" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                                            >
                                                <FileText className="size-3" />
                                                Resume
                                            </button>
                                        </div>
                                    </div>

                                    {bgSource === "github" ? (
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] text-zinc-400 font-semibold font-mono">Github Profile Link</label>
                                            <Input
                                                placeholder="https://github.com/your-username"
                                                value={githubUrl}
                                                onChange={(e) => setGithubUrl(e.target.value)}
                                                className="bg-zinc-950 border-zinc-800 text-xs py-4"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <label className="text-[11px] text-zinc-400 font-semibold font-mono">Upload or Paste Resume</label>
                                            
                                            {/* Drag and Drop Zone for Resume */}
                                            <div
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    setDraggingResume(true);
                                                }}
                                                onDragLeave={() => setDraggingResume(false)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setDraggingResume(false);
                                                    const file = e.dataTransfer.files[0];
                                                    if (file) handleResumeFile(file);
                                                }}
                                                onClick={() => {
                                                    const input = document.createElement("input");
                                                    input.type = "file";
                                                    input.accept = ".pdf,application/pdf";
                                                    input.onchange = (e: any) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleResumeFile(file);
                                                    };
                                                    input.click();
                                                }}
                                                className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-4 transition-all cursor-pointer ${
                                                    draggingResume
                                                        ? "border-primary bg-primary/5"
                                                        : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900/50"
                                                }`}
                                            >
                                                <FileText className={`size-6 mb-1 ${parsingResumePdf ? "animate-bounce text-primary" : "text-zinc-500"}`} />
                                                {parsingResumePdf ? (
                                                    <p className="text-[10px] font-medium text-white">Extracting resume info...</p>
                                                ) : resumePdfName ? (
                                                    <p className="text-[10px] font-medium text-primary">Uploaded: {resumePdfName}</p>
                                                ) : (
                                                    <p className="text-[10px] text-zinc-500 text-center">
                                                        Drag & drop resume PDF here, or <span className="text-primary hover:underline font-semibold">browse</span>
                                                    </p>
                                                )}
                                            </div>

                                            <textarea
                                                placeholder="Or paste your resume details directly here..."
                                                value={resumeText}
                                                onChange={(e) => setResumeText(e.target.value)}
                                                rows={4}
                                                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs outline-none text-white focus:border-zinc-700 resize-none"
                                            />
                                        </div>
                                    )}

                                    {/* Duration picker */}
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] text-zinc-400 font-semibold">Max Interview Duration</label>
                                        <div className="flex gap-2">
                                            {[20, 22, 25].map((d) => (
                                                <button
                                                    key={d}
                                                    onClick={() => setMockDuration(d)}
                                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${mockDuration === d
                                                            ? "bg-white text-black border-white"
                                                            : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                                                        }`}
                                                >
                                                    {d} min
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        onClick={startPracticeMock}
                                        disabled={startingMock}
                                        className="w-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-all mt-4"
                                    >
                                        {startingMock ? (
                                            <Loader2 className="size-4 animate-spin text-black" />
                                        ) : (
                                            <ArrowRight className="size-4 text-black animate-pulse" />
                                        )}
                                        Start technical interview
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Candidate past interviews */}
                        <div className="md:col-span-8 space-y-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <CheckCircle2 className="size-5 text-green-500" />
                                Your Past Interviews
                            </h3>
                            {loadingHistory ? (
                                <div className="flex justify-center py-12"><Loader2 className="size-8 animate-spin text-zinc-700" /></div>
                            ) : pastInterviews.length === 0 ? (
                                <div className="border border-zinc-800 rounded-xl p-16 flex flex-col items-center justify-center text-center space-y-3 bg-zinc-950/20 backdrop-blur-sm">
                                    <h3 className="text-sm font-semibold text-white">No history yet</h3>
                                    <p className="text-xs text-zinc-500 max-w-xs">
                                        Your completed scheduled sessions and mock practices will appear here. Configure the scheduler on the left to start.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {pastInterviews.map((session) => {
                                        const now = new Date();
                                        const isUpcoming = session.scheduledAt ? now < new Date(session.scheduledAt) : false;
                                        const isExpired = session.expiresAt ? now > new Date(session.expiresAt) : false;
                                        const isPre = session.status === "Pre";

                                        return (
                                            <div
                                                key={session.id}
                                                onClick={() => {
                                                    if (isPre) {
                                                        if (isExpired) {
                                                            toast.error("This interview invitation has expired.");
                                                        } else {
                                                            navigate(`/interview/${session.id}`);
                                                        }
                                                    } else {
                                                        navigate(`/result/${session.id}`);
                                                    }
                                                }}
                                                className={`rounded-xl border p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all cursor-pointer ${
                                                    isPre
                                                        ? isExpired
                                                            ? "border-red-950 bg-red-950/5 hover:bg-red-950/10"
                                                            : isUpcoming
                                                                ? "border-yellow-900/50 bg-yellow-950/5 hover:bg-yellow-950/10"
                                                                : "border-green-900/50 bg-green-950/5 hover:bg-green-950/10 hover:border-green-700"
                                                        : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900/20 hover:border-zinc-700"
                                                }`}
                                            >
                                                <div className="space-y-1.5 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h4 className="text-sm font-bold text-white">
                                                            {session.job?.title || session.targetRole || "Technical Interview"}
                                                        </h4>
                                                        {session.job?.organization?.name && (
                                                            <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-medium">
                                                                {session.job.organization.name}
                                                            </span>
                                                        )}
                                                        {isPre && (
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono ${
                                                                isExpired
                                                                    ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                                                    : isUpcoming
                                                                        ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                                                        : "bg-green-500/10 text-green-400 border border-green-500/20"
                                                            }`}>
                                                                {isExpired ? "EXPIRED" : isUpcoming ? "UPCOMING" : "ACTIVE NOW"}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                                                        <span className="flex items-center gap-1 font-mono">
                                                            <Calendar className="size-3.5" />
                                                            Created: {new Date(session.createdAt).toLocaleDateString()}
                                                        </span>
                                                        <span>•</span>
                                                        <span>{session.duration || 20} min limit</span>
                                                        {session.scheduledAt && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="text-zinc-400 font-mono font-medium">
                                                                    Start: {new Date(session.scheduledAt).toLocaleString()}
                                                                </span>
                                                            </>
                                                        )}
                                                        {session.expiresAt && (
                                                            <>
                                                                <span>•</span>
                                                                <span className={`${isExpired ? "text-red-400" : "text-zinc-400"} font-mono font-medium`}>
                                                                    Expiry: {new Date(session.expiresAt).toLocaleString()}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                                    {!isPre ? (
                                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${session.score >= 8 ? "bg-green-500/10 text-green-400" : session.score >= 5 ? "bg-yellow-500/10 text-yellow-400" : "bg-red-500/10 text-red-400"}`}>
                                                            {session.score}/10
                                                        </span>
                                                    ) : (
                                                        <Button
                                                            disabled={isExpired}
                                                            variant={isExpired ? "ghost" : isUpcoming ? "outline" : "default"}
                                                            size="sm"
                                                            className={`text-[10px] px-3 py-1.5 h-8 font-bold flex items-center gap-1 transition-all rounded-lg ${
                                                                isExpired
                                                                    ? "text-zinc-650 bg-transparent cursor-not-allowed border-zinc-900"
                                                                    : isUpcoming
                                                                        ? "border-yellow-850 hover:bg-yellow-950/20 text-yellow-400"
                                                                        : "bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20"
                                                            }`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (isExpired) return;
                                                                navigate(`/interview/${session.id}`);
                                                            }}
                                                        >
                                                            {isExpired ? "Expired" : isUpcoming ? "Upcoming" : "Start Interview"}
                                                            {!isExpired && <ArrowRight className="size-3.5" />}
                                                        </Button>
                                                    )}
                                                    {(!isPre || isExpired) && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteInterview(session.id);
                                                            }}
                                                            className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg border border-transparent hover:border-zinc-800 transition-all"
                                                            title="Delete interview from history"
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Reschedule / Schedule Modal Overlay */}
            {isScheduleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 space-y-6 shadow-2xl relative">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Calendar className="size-5 text-primary" />
                                {modalTargetInterviewId ? "Reschedule Interview" : "Schedule Technical Interview"}
                            </h3>
                            <p className="text-xs text-zinc-400 mt-1">
                                Set start time, expiration window, and duration details for candidate **{modalTargetName}**.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Job Role</label>
                                <Input
                                    disabled
                                    value={modalJobTitle}
                                    className="bg-zinc-900 border-zinc-800 text-xs py-3.5 h-8 text-zinc-400"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Scheduled Start Time (Optional)</label>
                                <input
                                    type="datetime-local"
                                    value={modalScheduledAt}
                                    onChange={(e) => setModalScheduledAt(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-zinc-700 h-9"
                                />
                                <span className="text-[9px] text-zinc-500 block">Leave blank to allow candidate to start immediately.</span>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Invitation Expiration Time (Optional)</label>
                                <input
                                    type="datetime-local"
                                    value={modalExpiresAt}
                                    onChange={(e) => setModalExpiresAt(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white outline-none focus:border-zinc-700 h-9"
                                />
                                <span className="text-[9px] text-zinc-500 block">Leave blank for no expiration limit.</span>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Max Duration</label>
                                <div className="flex gap-2">
                                    {[20, 22, 25].map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setModalDuration(d)}
                                            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                                                modalDuration === d
                                                    ? "bg-white text-black border-white"
                                                    : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white"
                                            }`}
                                        >
                                            {d} min
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1 border-zinc-800 hover:bg-zinc-900/50 text-xs py-2 h-9 rounded-lg"
                                onClick={() => setIsScheduleModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                disabled={savingModal}
                                className="flex-1 bg-white hover:bg-zinc-200 text-black text-xs font-semibold py-2 h-9 rounded-lg flex items-center justify-center gap-1.5"
                                onClick={handleSaveModalSchedule}
                            >
                                {savingModal ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                    "Save Schedule"
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
