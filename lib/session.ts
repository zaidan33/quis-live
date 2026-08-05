import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Sesi Better Auth sisi server, atau null bila tidak login. */
export async function getSession() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });
    return session;
}

/**
 * Mengembalikan user yang sedang login, atau redirect ke /sign-in.
 * Dipakai di seluruh route group (host).
 */
export async function requireUser() {
    const session = await getSession();
    if (!session?.user) {
        redirect("/sign-in");
    }
    return session.user;
}
