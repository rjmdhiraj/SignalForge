import z from "zod";

export const PreInterviewBody = z.object({
    candidateName: z.string(),
    targetRole: z.string(),
    type: z.enum(["github", "resume"]),
    github: z.string().optional().nullable(),
    resumeText: z.string().optional().nullable()
});