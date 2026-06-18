import z from "zod";

export const PreInterviewBody = z.object({
    candidateName: z.string(),
    targetRole: z.string(),
    type: z.enum(["github", "resume"]),
    github: z.string().optional().nullable(),
    resumeText: z.string().optional().nullable(),
    duration: z.number().optional().default(20),
    jobId: z.string().optional().nullable()
});