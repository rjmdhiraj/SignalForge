import "dotenv/config";
import express from "express";
import { PreInterviewBody } from "./types";
import { scrapeGithub } from "./scrapers/github";
import cors from "cors";
import { prisma } from "./db";
import { initSideband } from "./sideband";
import { calculateResult, generateText } from "./result";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { syncUserWithClerk } from "./auth";

declare global {
    namespace Express {
        interface Request {
            auth?: {
                userId?: string;
            };
        }
    }
}

const app = express();
app.use(express.json());
app.use(cors());
app.use((req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer mock_")) {
        const mockUserId = authHeader.substring(12); // Extract user after 'Bearer mock_'
        req.auth = { userId: mockUserId };
        req.isBypassed = true;
    }
    next();
});
const clerk = clerkMiddleware();
app.use((req: any, res: any, next: any) => {
    if (req.isBypassed) {
        next();
        return;
    }
    clerk(req, res, (err?: any) => {
        if (err) {
            console.error("Clerk middleware error callback:", err);
            return next(err);
        }
        const clerkAuth = getAuth(req);
        req.auth = {
            userId: clerkAuth.userId || undefined
        };
        next();
    });
});
app.use(express.text({ type: ["application/sdp", "text/plain"] }));

app.get("/api/v1/config/deepgram", (req, res) => {
    res.json({ key: process.env.DEEPGRAM_API_KEY || "" });
});

app.get("/api/v1/config/status", (req, res) => {
    res.json({
        hasOpenAI: !!process.env.OPENAI_KEY && process.env.OPENAI_KEY.trim() !== "",
        hasGemini: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== "",
        hasDeepgram: !!process.env.DEEPGRAM_API_KEY && process.env.DEEPGRAM_API_KEY.trim() !== ""
    });
});

app.get("/api/v1/session/speak", async (req, res) => {
    const text = req.query.text as string;
    if (!text || text.trim() === "") {
        res.status(400).json({ error: "Text query parameter is required." });
        return;
    }

    try {
        const deepgramKey = process.env.DEEPGRAM_API_KEY;
        if (!deepgramKey) {
            res.status(500).json({ error: "DEEPGRAM_API_KEY is not configured on the server." });
            return;
        }

        const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
            method: "POST",
            headers: {
                "Authorization": `Token ${deepgramKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Deepgram TTS error:", response.status, errText);
            res.status(response.status).json({ error: `Deepgram TTS error: ${errText}` });
            return;
        }

        const contentType = response.headers.get("content-type") || "audio/mpeg";
        res.setHeader("Content-Type", contentType);

        const reader = response.body?.getReader();
        if (!reader) {
            res.status(500).json({ error: "Could not read audio stream from Deepgram" });
            return;
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
    } catch (error: any) {
        console.error("Error in speak endpoint:", error);
        res.status(500).json({ error: error.message || "Failed to stream audio from Deepgram" });
    }
});

app.get("/api/v1/session/local/chat/:interviewId", async (req, res) => {
    const { interviewId } = req.params;
    try {
        const interview = await prisma.interview.findFirst({
            where: { id: interviewId },
            include: { conversations: { orderBy: { createdAt: "asc" } } }
        });

        if (!interview) {
            res.status(404).json({ error: "Interview session not found." });
            return;
        }

        const { candidateName, targetRole, resumeText, githubMetadata, createdAt } = interview;

        const conversationHistory = interview.conversations.map(msg =>
            `${msg.type === "User" ? "Candidate" : "Interviewer"}: ${msg.message}`
        ).join("\n");

        let prompt = `You are a senior technical interviewer conducting a friendly but rigorous job interview.
Candidate Name: ${candidateName || "Candidate"}
Target Role / Job Description: ${targetRole || "Software Developer"}

`;

        if (githubMetadata) {
            const parsedGithub = typeof githubMetadata === "string"
                ? JSON.parse(githubMetadata)
                : githubMetadata;
            prompt += `Candidate's GitHub repositories and star counts:
${JSON.stringify(parsedGithub, null, 2)}\n\n`;
        }

        if (resumeText) {
            prompt += `Candidate's Resume/Background details:
${resumeText}\n\n`;
        }

        // Calculate elapsed time (20 minutes limit)
        const elapsedMinutes = (Date.now() - new Date(createdAt).getTime()) / 60000;
        const isTimeNearlyUp = elapsedMinutes >= 18; // 18 minutes elapsed means 2 minutes left

        if (conversationHistory.trim() === "") {
            prompt += `This is the beginning of the interview. Please greet the candidate (${candidateName || "Candidate"}) by name, introduce yourself, and ask the first question.
Focus the question on their background, target role, or a project from their GitHub/resume.
Keep your response short (1-2 sentences max) and conversational so it sounds natural when spoken aloud.`;
        } else {
            prompt += `Here is the conversation transcript so far:
${conversationHistory}

`;
            if (isTimeNearlyUp) {
                prompt += `[SYSTEM NOTICE: The 20-minute interview time limit is almost up. Please politely inform ${candidateName || "the candidate"} that we are wrapping up, make a brief friendly closing statement, thank them for their time, and DO NOT ask any more questions.]`;
            } else {
                prompt += `Based on the conversation, ask the next logical follow-up question or dive deeper into their previous technical statement.
If you feel the interview is complete (e.g., after 5-7 questions and answers, or if they wrap up), make a brief, friendly closing statement, thank them, and do not ask any more questions.
Keep your response brief (1-2 sentences max) and conversational so it sounds natural when spoken. Do not add formatting like quotes or titles.`;
            }
        }

        // Call Gemini/Groq to generate the next response
        const result = await generateText(prompt);

        // Save the assistant's message to the database
        const savedMessage = await prisma.message.create({
            data: {
                interviewId,
                type: "Assistant",
                message: result
            }
        });

        res.json({ question: savedMessage.message });
    } catch (err: any) {
        console.error("Local session error:", err);
        res.status(500).json({ error: err.message || "Failed to generate interviewer question" });
    }
});

app.post("/api/v1/session/local/respond/:interviewId", async (req, res) => {
    const { interviewId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === "") {
        res.status(400).json({ error: "Message content is required." });
        return;
    }

    try {
        await prisma.message.create({
            data: {
                interviewId,
                type: "User",
                message
            }
        });
        res.json({ status: "saved" });
    } catch (err: any) {
        console.error("Failed to save response:", err);
        res.status(500).json({ error: err.message || "Failed to save response" });
    }
});

app.post("/api/v1/pre-interview", async (req, res) => {
    const { success, data } = PreInterviewBody.safeParse(req.body);

    if (!success) {
        res.status(411).json({
            message: "Incorrect body"
        });
        return;
    }

    let githubData = null;
    let githubUrl = null;

    if (data.type === "github" && data.github) {
        try {
            githubUrl = data.github.endsWith("/") ? data.github.slice(0, -1) : data.github;
            const githubUsername = githubUrl.split("/").pop()!;
            githubData = await scrapeGithub(githubUsername);
        } catch (e) {
            console.error("Failed to scrape GitHub username:", e);
            githubData = { username: "", repositories: [] };
        }
    }

    const userId = req.auth?.userId;

    const interview = await prisma.interview.create({
        data: {
            candidateName: data.candidateName,
            targetRole: data.targetRole,
            resumeText: data.type === "resume" ? data.resumeText : null,
            githubUrl: data.type === "github" ? githubUrl : null,
            githubMetadata: (githubData || undefined) as any,
            status: "Pre",
            duration: data.duration || 20,
            userId: userId || null,
            jobId: data.jobId || null
        }
    });

    res.json({ id: interview.id });
});

// Authentication & Profile Endpoints
app.post("/api/v1/user/sync", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const dbUser = await syncUserWithClerk(userId);
        res.json(dbUser);
    } catch (err: any) {
        console.error("Error in user sync:", err);
        res.status(500).json({ error: err.message || "Failed to sync user" });
    }
});

app.get("/api/v1/user/profile", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { organization: true }
        });
        res.json(dbUser);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch profile" });
    }
});

app.post("/api/v1/user/role", async (req, res) => {
    const userId = req.auth?.userId;
    const { role } = req.body;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!["Candidate", "Recruiter", "Admin"].includes(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
    }
    try {
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role }
        });
        res.json(updatedUser);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to update role" });
    }
});

// Authorization helper functions
async function checkRecruiterOrAdmin(userId: string, orgId?: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    if (!user) return false;
    if (user.role === "Admin") return true;
    if (user.role === "Recruiter") {
        if (orgId && user.organizationId !== orgId) return false;
        return true;
    }
    return false;
}

async function checkAdmin(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    return user?.role === "Admin";
}

// Organization & Team Endpoints
app.post("/api/v1/organization/create", async (req, res) => {
    const userId = req.auth?.userId;
    const { name, type } = req.body;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!name || !name.trim()) {
        res.status(400).json({ error: "Organization name is required" });
        return;
    }
    try {
        const org = await prisma.organization.create({
            data: {
                name: name.trim(),
                type: type || "Company",
                members: {
                    connect: { id: userId }
                }
            }
        });

        // Promote Candidate user role to Recruiter when they register a team
        const caller = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (caller && caller.role === "Candidate") {
            await prisma.user.update({
                where: { id: userId },
                data: { role: "Recruiter" }
            });
        }

        res.json(org);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to create organization" });
    }
});

app.get("/api/v1/organization/list", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const orgs = await prisma.organization.findMany({
            where: {
                members: {
                    some: { id: userId }
                }
            }
        });
        res.json(orgs);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to list organizations" });
    }
});

// Job Template Posting Endpoints
app.post("/api/v1/organization/:id/jobs", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    const { title, description } = req.body;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!title || !title.trim() || !description || !description.trim()) {
        res.status(400).json({ error: "Job title and description are required" });
        return;
    }
    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied. Only recruiters of this organization or admins are authorized." });
            return;
        }
        const job = await prisma.job.create({
            data: {
                title: title.trim(),
                description: description.trim(),
                organizationId: id
            }
        });
        res.json(job);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to create job posting" });
    }
});

app.get("/api/v1/organization/:id/jobs", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }
        const jobs = await prisma.job.findMany({
            where: { organizationId: id },
            orderBy: { createdAt: "desc" }
        });
        res.json(jobs);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch jobs" });
    }
});

app.delete("/api/v1/organization/:orgId/jobs/:jobId", async (req, res) => {
    const userId = req.auth?.userId;
    const { orgId, jobId } = req.params;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, orgId);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }

        const job = await prisma.job.findFirst({
            where: { id: jobId, organizationId: orgId }
        });

        if (!job) {
            res.status(404).json({ error: "Job role not found in this organization." });
            return;
        }

        const interviews = await prisma.interview.findMany({
            where: { jobId }
        });
        const interviewIds = interviews.map(i => i.id);

        await prisma.message.deleteMany({
            where: { interviewId: { in: interviewIds } }
        });

        await prisma.interview.deleteMany({
            where: { jobId }
        });

        await prisma.job.delete({
            where: { id: jobId }
        });

        res.json({ message: "Job role and associated interviews deleted successfully." });
    } catch (err: any) {
        console.error("Error deleting job role:", err);
        res.status(500).json({ error: err.message || "Failed to delete job role" });
    }
});

app.get("/api/v1/organization/:id/candidates", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }
        const interviews = await prisma.interview.findMany({
            where: {
                job: { organizationId: id }
            },
            include: {
                user: true,
                job: true
            },
            orderBy: { createdAt: "desc" }
        });
        res.json(interviews);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch candidate scoreboards" });
    }
});

app.get("/api/v1/organization/job/:jobId", async (req, res) => {
    const { jobId } = req.params;
    try {
        const job = await prisma.job.findUnique({
            where: { id: jobId },
            include: { organization: true }
        });
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }
        res.json(job);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch job" });
    }
});

// Organization Members & Member Scheduling Endpoints
app.post("/api/v1/organization/:id/members/add", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    const { email, name, role } = req.body;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!email || !email.trim()) {
        res.status(400).json({ error: "Member email is required" });
        return;
    }

    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied. Only recruiters of this organization or admins are authorized." });
            return;
        }

        const targetRole = role || "Candidate";
        let member = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() }
        });

        if (member) {
            member = await prisma.user.update({
                where: { id: member.id },
                data: { 
                    organizationId: id,
                    role: targetRole
                }
            });
        } else {
            const crypto = require("crypto");
            const newMemberId = `user_placeholder_${crypto.randomUUID()}`;
            member = await prisma.user.create({
                data: {
                    id: newMemberId,
                    email: email.trim().toLowerCase(),
                    name: name?.trim() || "Candidate",
                    role: targetRole,
                    organizationId: id
                }
            });
        }

        res.json(member);
    } catch (err: any) {
        console.error("Error adding member:", err);
        res.status(500).json({ error: err.message || "Failed to add member to organization" });
    }
});

app.get("/api/v1/organization/:id/members", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }

        const members = await prisma.user.findMany({
            where: { organizationId: id },
            orderBy: { createdAt: "desc" }
        });
        res.json(members);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch organization members" });
    }
});

app.post("/api/v1/organization/:id/schedule-member", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    const { memberId, jobId, duration, scheduledAt, expiresAt } = req.body;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!memberId || !jobId) {
        res.status(400).json({ error: "Member ID and Job ID are required" });
        return;
    }

    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }

        const member = await prisma.user.findFirst({
            where: { id: memberId, organizationId: id }
        });
        const job = await prisma.job.findFirst({
            where: { id: jobId, organizationId: id }
        });

        if (!member || !job) {
            res.status(404).json({ error: "Member or Job role not found in this organization." });
            return;
        }

        const interview = await prisma.interview.create({
            data: {
                candidateName: member.name || "Candidate",
                targetRole: job.title,
                status: "Pre",
                duration: duration || 20,
                userId: member.id,
                jobId: job.id,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                expiresAt: expiresAt ? new Date(expiresAt) : null
            }
        });

        res.json({
            interviewId: interview.id,
            link: `http://localhost:3000/interview/${interview.id}`
        });
    } catch (err: any) {
        console.error("Error scheduling member interview:", err);
        res.status(500).json({ error: err.message || "Failed to schedule member interview" });
    }
});

app.post("/api/v1/organization/:id/schedule-all", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    const { jobId, duration, scheduledAt, expiresAt, limit } = req.body;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    if (!jobId) {
        res.status(400).json({ error: "Job ID is required" });
        return;
    }

    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }

        const job = await prisma.job.findFirst({
            where: { id: jobId, organizationId: id }
        });
        if (!job) {
            res.status(404).json({ error: "Job role not found in this organization." });
            return;
        }

        // Find candidates in this organization with limit if provided
        const candidates = await prisma.user.findMany({
            where: { organizationId: id, role: "Candidate" },
            take: limit ? Number(limit) : undefined
        });

        if (candidates.length === 0) {
            res.json({ count: 0, message: "No candidates found in this organization to schedule." });
            return;
        }

        const scheduledAtDate = scheduledAt ? new Date(scheduledAt) : null;
        const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

        // Create interviews for all candidates in a transaction
        const creations = candidates.map(candidate => 
            prisma.interview.create({
                data: {
                    candidateName: candidate.name || "Candidate",
                    targetRole: job.title,
                    status: "Pre",
                    duration: duration || 20,
                    userId: candidate.id,
                    jobId: job.id,
                    scheduledAt: scheduledAtDate,
                    expiresAt: expiresAtDate
                }
            })
        );

        await prisma.$transaction(creations);

        res.json({ count: candidates.length });
    } catch (err: any) {
        console.error("Error batch scheduling interviews:", err);
        res.status(500).json({ error: err.message || "Failed to batch schedule interviews" });
    }
});

app.delete("/api/v1/organization/:id", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const hasAccess = await checkRecruiterOrAdmin(userId, id);
        if (!hasAccess) {
            res.status(403).json({ error: "Access denied." });
            return;
        }

        const orgJobs = await prisma.job.findMany({
            where: { organizationId: id }
        });
        const jobIds = orgJobs.map(j => j.id);

        const orgInterviews = await prisma.interview.findMany({
            where: { jobId: { in: jobIds } }
        });
        const interviewIds = orgInterviews.map(i => i.id);

        await prisma.message.deleteMany({
            where: { interviewId: { in: interviewIds } }
        });

        await prisma.interview.deleteMany({
            where: { id: { in: interviewIds } }
        });

        await prisma.job.deleteMany({
            where: { id: { in: jobIds } }
        });

        await prisma.user.updateMany({
            where: { organizationId: id },
            data: { organizationId: null }
        });

        await prisma.organization.delete({
            where: { id }
        });

        res.json({ success: true });
    } catch (err: any) {
        console.error("Error deleting organization:", err);
        res.status(500).json({ error: err.message || "Failed to delete organization" });
    }
});

// Interview Schedule Info & Rescheduling Endpoints
app.get("/api/v1/interview/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const interview = await prisma.interview.findUnique({
            where: { id },
            include: { job: { include: { organization: true } } }
        });
        if (!interview) {
            res.status(404).json({ error: "Interview session not found" });
            return;
        }

        const now = new Date();
        const isNotStartedYet = interview.scheduledAt ? now < new Date(interview.scheduledAt) : false;
        const isExpired = interview.expiresAt ? now > new Date(interview.expiresAt) : false;

        res.json({
            ...interview,
            isNotStartedYet,
            isExpired
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch interview details" });
    }
});

app.post("/api/v1/interview/:id/reschedule", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    const { scheduledAt, expiresAt, duration } = req.body;

    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const interview = await prisma.interview.findUnique({
            where: { id },
            include: { job: true }
        });

        if (!interview) {
            res.status(404).json({ error: "Interview not found" });
            return;
        }

        // Check access: must be recruiter of the organization or Admin
        if (interview.job) {
            const hasAccess = await checkRecruiterOrAdmin(userId, interview.job.organizationId);
            if (!hasAccess) {
                res.status(403).json({ error: "Access denied." });
                return;
            }
        } else {
            // If it's a mock interview, only the candidate themselves can reschedule
            if (interview.userId !== userId) {
                res.status(403).json({ error: "Access denied." });
                return;
            }
        }

        const updated = await prisma.interview.update({
            where: { id },
            data: {
                scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                duration: duration !== undefined ? duration : interview.duration
            }
        });

        res.json(updated);
    } catch (err: any) {
        console.error("Error rescheduling interview:", err);
        res.status(500).json({ error: err.message || "Failed to reschedule interview" });
    }
});

// Candidate Specific Endpoints
app.get("/api/v1/candidate/interviews", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const interviews = await prisma.interview.findMany({
            where: { userId },
            include: {
                job: {
                    include: {
                        organization: true
                    }
                }
            },
            orderBy: { createdAt: "desc" }
        });
        res.json(interviews);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch candidate history" });
    }
});

app.delete("/api/v1/candidate/interview/:id", async (req, res) => {
    const userId = req.auth?.userId;
    const { id } = req.params;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    try {
        const interview = await prisma.interview.findFirst({
            where: {
                id,
                userId
            }
        });
        if (!interview) {
            res.status(404).json({ error: "Interview session not found or access denied." });
            return;
        }

        // Candidates can only delete completed or expired interviews
        const isPre = interview.status === "Pre";
        const isExpired = interview.expiresAt ? new Date() > new Date(interview.expiresAt) : false;
        if (isPre && !isExpired) {
            res.status(400).json({ error: "Cannot delete a scheduled interview until it has completed or expired." });
            return;
        }

        // Delete related messages first due to foreign key constraint
        await prisma.message.deleteMany({
            where: { interviewId: id }
        });

        await prisma.interview.delete({
            where: { id }
        });

        res.json({ success: true });
    } catch (err: any) {
        console.error("Error deleting interview:", err);
        res.status(500).json({ error: err.message || "Failed to delete interview session" });
    }
});

// Admin Panel Endpoints
app.get("/api/v1/admin/users", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const isAdmin = await checkAdmin(userId);
    if (!isAdmin) {
        res.status(403).json({ error: "Access denied. Admin authorization required." });
        return;
    }
    try {
        const users = await prisma.user.findMany({
            include: { organization: true },
            orderBy: { createdAt: "desc" }
        });
        res.json(users);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch users" });
    }
});

app.post("/api/v1/admin/user/:id/role", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const isAdmin = await checkAdmin(userId);
    if (!isAdmin) {
        res.status(403).json({ error: "Access denied. Admin authorization required." });
        return;
    }
    const { id } = req.params;
    const { role } = req.body;
    try {
        const user = await prisma.user.update({
            where: { id },
            data: { role }
        });
        res.json(user);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to update user role" });
    }
});

app.get("/api/v1/admin/organizations", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const isAdmin = await checkAdmin(userId);
    if (!isAdmin) {
        res.status(403).json({ error: "Access denied. Admin authorization required." });
        return;
    }
    try {
        const orgs = await prisma.organization.findMany({
            include: { _count: { select: { members: true, jobs: true } } },
            orderBy: { createdAt: "desc" }
        });
        res.json(orgs);
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to fetch organizations" });
    }
});

app.delete("/api/v1/admin/organization/:id", async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const isAdmin = await checkAdmin(userId);
    if (!isAdmin) {
        res.status(403).json({ error: "Access denied. Admin authorization required." });
        return;
    }
    const { id } = req.params;
    try {
        await prisma.organization.delete({
            where: { id }
        });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || "Failed to delete organization" });
    }
});

app.post("/api/v1/session/:interviewId", async (req, res) => {

    const sessionConfig = JSON.stringify({
        type: "realtime",
        model: "gpt-realtime",
        audio: { output: { voice: "marin" } },
    });

    const fd = new FormData();
    fd.set("sdp", req.body);
    fd.set("session", sessionConfig);

    try {
        const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_KEY}`,
                "OpenAI-Safety-Identifier": "hashed-user-id",
            },
            body: fd,
        });

        if (!sdpResponse.ok) {
            const errorText = await sdpResponse.text();
            console.error("OpenAI API call failed with status", sdpResponse.status, errorText);
            res.status(sdpResponse.status).send(`OpenAI API Error: ${errorText}`);
            return;
        }

        const location = sdpResponse.headers.get("Location");
        const callId = location?.split("/").pop()!;
        console.log("Session Call ID:", callId);
        // Send back the SDP we received from the OpenAI REST API
        const sdp = await sdpResponse.text();
        res.send(sdp);

        initSideband(callId, req.params.interviewId);
    } catch (error) {
        console.error("Token generation error:", error);
        res.status(500).send("Failed to generate session token due to an internal server error.");
    }

});

app.post("/api/v1/session/user/response/:interviewId", async (req, res) => {
    const { message } = req.body;
    await prisma.message.create({
        data: {
            interviewId: req.params.interviewId!,
            type: "User",
            message: message
        }
    });

    res.json({ message: "Message saved" });
})

app.get("/api/v1/result/:interviewId", async (req, res) => {
    const interview = await prisma.interview.findFirst({
        where: {
            id: req.params.interviewId
        },
        include: {
            conversations: true
        }
    })

    if (!interview) {
        res.status(411).json({
            message: "Interview not found"
        })
        return
    }

    res.json({
        score: interview?.score,
        feedback: interview?.feedback,
        transcript: interview?.conversations.map(c => ({
            type: c.type,
            content: c.message,
            createdAt: c.createdAt
        })),
        status: interview.status
    })

    // TODO: Should add some sort of a lock here.
    if (interview.status != "Done") {
        const result = await calculateResult(interview.conversations, interview.targetRole, interview.candidateName)

        await prisma.interview.update({
            where: {
                id: req.params.interviewId
            },
            data: {
                status: "Done",
                feedback: result.feedback,
                score: result.score
            }
        })
    }
})

app.listen(3001);
