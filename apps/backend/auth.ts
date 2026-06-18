import { clerkClient } from "@clerk/express";
import { prisma } from "./db";

export async function syncUserWithClerk(userId: string) {
    let dbUser = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!dbUser) {
        try {
            const clerkUser = await clerkClient.users.getUser(userId);
            const email = clerkUser.emailAddresses[0]?.emailAddress || `${userId}@no-email.clerk`;
            const name = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || clerkUser.username || "User";
            
            dbUser = await prisma.user.create({
                data: {
                    id: userId,
                    email,
                    name,
                    role: "Candidate" // Default role
                }
            });
        } catch (error) {
            console.error("Failed to sync user with Clerk:", error);
            // Fallback user insertion if Clerk API fails
            dbUser = await prisma.user.create({
                data: {
                    id: userId,
                    email: `${userId}@no-email.clerk`,
                    name: "User",
                    role: "Candidate"
                }
            });
        }
    }
    return dbUser;
}
