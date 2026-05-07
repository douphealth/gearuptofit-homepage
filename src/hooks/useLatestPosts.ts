import { useQuery } from "@tanstack/react-query";

export interface LivePost {
  id: number;
  title: string;
  excerpt: string;
  url: string;
  imageUrl: string;
  category: string;
  date: string;
  isoDate: string;
  modifiedIso: string;
}

const APEX = "https://gearuptofit.com";
const FALLBACK_IMAGE =
  "https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\[&hellip;\]|\[\u2026\]/g, "…")
    .replace(/&hellip;/g, "…")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url: string): string {
  if (!url) return APEX;
  return url
    .replace(/^https?:\/\/origin\.gearuptofit\.com/i, APEX)
    .replace(/^http:\/\/gearuptofit\.com/i, APEX);
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function fetchLatestPosts(perPage: number): Promise<LivePost[]> {
  const endpoint = `${APEX}/wp-json/wp/v2/posts?per_page=${perPage}&_embed=wp:featuredmedia,wp:term&status=publish`;
  const res = await fetch(endpoint, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`WP REST failed: ${res.status}`);
  const data: any[] = await res.json();

  return data
    .map((p) => {
      const emb = p._embedded || {};
      const media = (emb["wp:featuredmedia"] || [])[0] || {};
      const terms = (emb["wp:term"] || [])[0] || [];
      const category =
        terms.find((t: any) => t?.taxonomy === "category")?.name ||
        terms[0]?.name ||
        "Article";
      const imageUrl = normalizeUrl(media?.source_url || "") || FALLBACK_IMAGE;
      return {
        id: p.id as number,
        title: stripHtml(p.title?.rendered || ""),
        excerpt: stripHtml(p.excerpt?.rendered || "").slice(0, 180),
        url: normalizeUrl(p.link || ""),
        imageUrl,
        category,
        date: formatDate(p.date || p.modified || ""),
        isoDate: p.date || "",
        modifiedIso: p.modified || p.date || "",
      } as LivePost;
    })
    .filter((p) => p.title && p.url);
}

export function useLatestPosts(perPage = 9) {
  return useQuery({
    queryKey: ["latest-posts", perPage],
    queryFn: () => fetchLatestPosts(perPage),
    staleTime: 1000 * 60 * 10, // 10 min
    refetchInterval: 1000 * 60 * 15, // 15 min
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
