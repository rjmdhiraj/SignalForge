import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

function getHttpsAgent() {
    if (process.env.PROXY_URL) {
        return new HttpsProxyAgent(process.env.PROXY_URL);
    }
    return undefined;
}

export async function scrapeGithub(username: string) {
    const httpsAgent = getHttpsAgent();
    const userRepos = await axios.request({
        url: `https://api.github.com/users/${username}/repos`,
        ...(httpsAgent ? { httpsAgent } : {}),
    });
    return userRepos.data.map((x: any) => ({
        description: x.description,
        name: x.name,
        fullName: x.full_name,
        starCount: x.stargazers_count
    }))

}