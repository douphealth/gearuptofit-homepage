import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Sparkles, ArrowRight, RefreshCw } from "lucide-react";
import { useLatestPosts, type LivePost } from "@/hooks/useLatestPosts";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

const SCHEMA_ID = "ld-latest-posts";

function injectSchema(posts: LivePost[]) {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(SCHEMA_ID);
  if (existing) existing.remove();
  if (!posts.length) return;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Latest GearUpToFit Articles",
    description:
      "Most recent expert fitness, running, nutrition, and gear-review articles from GearUpToFit, updated continuously.",
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: posts.length,
    itemListElement: posts.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: p.url,
      item: {
        "@type": "BlogPosting",
        "@id": p.url,
        headline: p.title,
        url: p.url,
        image: p.imageUrl,
        datePublished: p.isoDate,
        dateModified: p.modifiedIso,
        articleSection: p.category,
        description: p.excerpt,
        mainEntityOfPage: { "@type": "WebPage", "@id": p.url },
        author: {
          "@type": "Organization",
          name: "GearUpToFit Editorial Team",
          url: "https://gearuptofit.com",
        },
        publisher: {
          "@type": "Organization",
          name: "GearUpToFit",
          logo: {
            "@type": "ImageObject",
            url: "https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png",
          },
        },
      },
    })),
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = SCHEMA_ID;
  script.text = JSON.stringify(itemList);
  document.head.appendChild(script);
}

const Skeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="bg-card border border-border rounded-sm overflow-hidden animate-pulse"
        aria-hidden="true"
      >
        <div className="aspect-[16/10] bg-secondary" />
        <div className="p-5 space-y-3">
          <div className="h-3 w-20 bg-secondary rounded-sm" />
          <div className="h-4 w-full bg-secondary rounded-sm" />
          <div className="h-4 w-3/4 bg-secondary rounded-sm" />
          <div className="h-3 w-full bg-secondary rounded-sm" />
        </div>
      </div>
    ))}
  </div>
);

const LatestFromBlog = () => {
  const { data, isLoading, isError, isFetching, refetch } = useLatestPosts(9);

  const posts = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    injectSchema(posts);
    return () => {
      const el = document.getElementById(SCHEMA_ID);
      if (el) el.remove();
    };
  }, [posts]);

  return (
    <section
      id="latest-from-blog"
      aria-labelledby="latest-blog-heading"
      className="py-20 md:py-28 bg-card/40"
    >
      <div className="container">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <span className="inline-flex items-center gap-2 text-sm font-display uppercase tracking-widest text-primary mb-3">
              <Sparkles className="w-4 h-4" />
              Updated Continuously
            </span>
            <h2
              id="latest-blog-heading"
              data-speakable
              className="text-4xl md:text-5xl font-bold uppercase tracking-tight font-display leading-[1.05]"
            >
              Latest From The Blog
            </h2>
            <p className="text-muted-foreground text-base md:text-lg font-body mt-3 max-w-2xl">
              Fresh, science-backed guides on running, training, nutrition, and
              gear — pulled live from gearuptofit.com and refreshed every few
              minutes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh latest articles"
            className="self-start sm:self-end inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-border bg-secondary/60 text-sm font-display uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </motion.header>

        {isLoading && <Skeleton />}

        {isError && !isLoading && (
          <div
            role="alert"
            className="bg-card border border-border p-6 rounded-sm text-center"
          >
            <p className="text-muted-foreground font-body mb-3">
              Couldn't load the latest articles right now.
            </p>
            <button
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 text-primary font-display uppercase tracking-wider text-sm font-semibold"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
          </div>
        )}

        {!isLoading && !isError && posts.length > 0 && (
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {posts.map((post, i) => (
              <motion.article
                key={post.id}
                variants={item}
                itemScope
                itemType="https://schema.org/BlogPosting"
                className="group bg-card border border-border overflow-hidden card-hover rounded-sm flex flex-col"
              >
                <a
                  href={post.url}
                  className="block flex-1 flex flex-col"
                  aria-label={`Read: ${post.title}`}
                >
                  <div className="aspect-[16/10] overflow-hidden bg-secondary">
                    <img
                      src={post.imageUrl}
                      alt={post.title}
                      width={640}
                      height={400}
                      loading={i < 3 ? "eager" : "lazy"}
                      decoding="async"
                      itemProp="image"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png";
                      }}
                    />
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        itemProp="articleSection"
                        className="text-xs font-display uppercase tracking-widest text-primary font-semibold"
                      >
                        {post.category}
                      </span>
                      {post.date && (
                        <time
                          itemProp="datePublished"
                          dateTime={post.isoDate}
                          className="text-xs text-muted-foreground flex items-center gap-1 font-body"
                        >
                          <Clock className="w-3 h-3" />
                          {post.date}
                        </time>
                      )}
                    </div>
                    <h3
                      itemProp="headline"
                      className="text-base md:text-lg font-bold uppercase tracking-tight font-display leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2"
                    >
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p
                        itemProp="description"
                        className="text-sm text-muted-foreground font-body line-clamp-3 leading-relaxed mb-4"
                      >
                        {post.excerpt}
                      </p>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1.5 text-primary font-display uppercase tracking-wider text-xs font-semibold group-hover:gap-2.5 transition-all">
                      Read article
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                    <link itemProp="url" href={post.url} />
                  </div>
                </a>
              </motion.article>
            ))}
          </motion.div>
        )}

        <div className="mt-10 text-center">
          <a
            href="https://gearuptofit.com/blog/"
            className="inline-flex items-center gap-2 text-primary font-display uppercase tracking-wider text-sm font-semibold hover:gap-3 transition-all"
          >
            Browse the full blog
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default LatestFromBlog;
