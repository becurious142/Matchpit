import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@clerk/react";
import { useGetMyProfile } from "@workspace/api-client-react";
import { Heart, MessageCircle, Share2, Plus, Users, Trophy, Star, Flame, Image as ImageIcon, ChevronDown } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

const POST_TYPES = [
  { value: "text", label: "Update", icon: "💬" },
  { value: "looking_players", label: "Looking for Players", icon: "🔍" },
  { value: "match_result", label: "Match Result", icon: "🏆" },
  { value: "challenge", label: "Challenge", icon: "⚡" },
  { value: "venue_review", label: "Venue Review", icon: "📍" },
];

const TYPE_COLORS: Record<string, string> = {
  text: "text-muted-foreground bg-muted",
  image: "text-blue-400 bg-blue-500/10",
  looking_players: "text-green-400 bg-green-500/10",
  match_result: "text-yellow-400 bg-yellow-500/10",
  challenge: "text-orange-400 bg-orange-500/10",
  venue_review: "text-purple-400 bg-purple-500/10",
  achievement: "text-primary bg-primary/10",
};

const TYPE_ICONS: Record<string, string> = {
  text: "💬",
  image: "🖼️",
  looking_players: "🔍",
  match_result: "🏆",
  challenge: "⚡",
  venue_review: "📍",
  achievement: "🎖️",
};

const SPORTS_FILTER = ["all", "football", "cricket", "badminton", "box_cricket", "pickleball"];

interface Post {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar: string | null;
  authorTrustScore: number;
  type: string;
  caption: string;
  imageUrl: string | null;
  sport: string | null;
  likesCount: number;
  commentsCount: number;
  relatedMatchId: string | null;
  createdAt: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function CommunityPage() {
  const { isSignedIn } = useUser();
  const { data: profile } = useGetMyProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sportFilter, setSportFilter] = useState("all");
  const [showComposer, setShowComposer] = useState(false);
  const [newCaption, setNewCaption] = useState("");
  const [newType, setNewType] = useState("text");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ posts: Post[]; hasMore: boolean }>({
    queryKey: ["community-feed", sportFilter],
    queryFn: () => apiFetch(`/community/feed${sportFilter !== "all" ? `?sport=${sportFilter}` : ""}`),
    refetchInterval: 30000,
  });

  const createPost = useMutation({
    mutationFn: (body: any) => apiFetch("/community/post", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-feed"] });
      setNewCaption("");
      setShowComposer(false);
      toast({ title: "Posted to the community!" });
    },
    onError: () => toast({ title: "Failed to post", variant: "destructive" }),
  });

  const likePost = useMutation({
    mutationFn: (postId: string) => apiFetch("/community/like", { method: "POST", body: JSON.stringify({ postId }) }),
    onSuccess: (_, postId) => {
      setLikedPosts((prev) => new Set([...prev, postId]));
      queryClient.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });

  const unlikePost = useMutation({
    mutationFn: (postId: string) => apiFetch(`/community/like?postId=${postId}`, { method: "DELETE" }),
    onSuccess: (_, postId) => {
      setLikedPosts((prev) => { const s = new Set(prev); s.delete(postId); return s; });
      queryClient.invalidateQueries({ queryKey: ["community-feed"] });
    },
  });

  const handleLike = (postId: string) => {
    if (!isSignedIn) { toast({ title: "Sign in to like posts" }); return; }
    if (likedPosts.has(postId)) {
      unlikePost.mutate(postId);
    } else {
      likePost.mutate(postId);
    }
  };

  const handlePost = () => {
    if (!newCaption.trim()) return;
    createPost.mutate({ caption: newCaption, type: newType });
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold uppercase italic tracking-tighter mb-1">
          Sports <span className="text-primary">Adda</span>
        </h1>
        <p className="text-muted-foreground text-sm">Jaipur's live sports community feed</p>
      </div>

      {/* Post Composer */}
      {isSignedIn && (
        <Card className="mb-6 bg-card border-border/60">
          <CardContent className="p-4">
            {!showComposer ? (
              <button
                onClick={() => setShowComposer(true)}
                className="w-full flex items-center gap-3 text-left text-muted-foreground hover:text-foreground transition-colors"
              >
                <Avatar className="w-9 h-9">
                  <AvatarImage src={profile?.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                    {profile?.fullName?.[0] ?? "P"}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 bg-muted rounded-full px-4 py-2.5 text-sm">What's happening on the pitch?</span>
                <Plus className="w-5 h-5 text-primary" />
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {POST_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setNewType(t.value)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                        newType === t.value ? "bg-primary text-black border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Share what's happening..."
                  className="min-h-[100px] bg-muted border-border/50 resize-none"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => { setShowComposer(false); setNewCaption(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="font-bold uppercase"
                    disabled={!newCaption.trim() || createPost.isPending}
                    onClick={handlePost}
                  >
                    {createPost.isPending ? "Posting..." : "Post"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sport Filter Strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {SPORTS_FILTER.map((s) => (
          <button
            key={s}
            onClick={() => setSportFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-colors ${
              sportFilter === s ? "bg-primary text-black" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All Sports" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : !data?.posts?.length ? (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="py-20 text-center">
            <div className="text-5xl mb-4">🏟️</div>
            <p className="font-bold text-lg text-muted-foreground">No posts yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Be the first to post something!</p>
            {isSignedIn && (
              <Button className="mt-6 font-bold uppercase italic" size="sm" onClick={() => setShowComposer(true)}>
                Create First Post
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isLiked={likedPosts.has(post.id)}
              onLike={() => handleLike(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, isLiked, onLike }: { post: Post; isLiked: boolean; onLike: () => void }) {
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const { isSignedIn } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: comments } = useQuery<any[]>({
    queryKey: ["post-comments", post.id],
    queryFn: () => apiFetch(`/community/${post.id}/comments`),
    enabled: showComments,
  });

  const addComment = useMutation({
    mutationFn: (comment: string) =>
      apiFetch("/community/comment", { method: "POST", body: JSON.stringify({ postId: post.id, comment }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-comments", post.id] });
      queryClient.invalidateQueries({ queryKey: ["community-feed"] });
      setNewComment("");
    },
    onError: () => toast({ title: "Failed to comment", variant: "destructive" }),
  });

  return (
    <Card className="bg-card border-border/60 overflow-hidden hover:border-border transition-colors">
      <CardContent className="p-4">
        {/* Author row */}
        <div className="flex items-start gap-3 mb-3">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={post.authorAvatar ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary font-bold">
              {post.authorName[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm">{post.authorName}</span>
              {post.authorTrustScore >= 90 && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 border-primary/30 text-primary uppercase font-bold">
                  Trusted
                </Badge>
              )}
              {post.sport && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 uppercase font-bold">
                  {post.sport.replace("_", " ")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${TYPE_COLORS[post.type] ?? "text-muted-foreground bg-muted"}`}>
                {TYPE_ICONS[post.type]} {post.type.replace("_", " ")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(parseISO(post.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        {/* Caption */}
        <p className="text-sm leading-relaxed mb-3">{post.caption}</p>

        {/* Image */}
        {post.imageUrl && (
          <div className="mb-3 rounded-lg overflow-hidden bg-muted">
            <img src={post.imageUrl} alt="Post" className="w-full max-h-80 object-cover" />
          </div>
        )}

        {/* Related match CTA */}
        {post.relatedMatchId && (
          <Link href={`/matches/${post.relatedMatchId}`}>
            <div className="flex items-center gap-2 text-xs text-primary mb-3 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              <Trophy className="w-3.5 h-3.5" />
              <span className="font-medium">View linked match →</span>
            </div>
          </Link>
        )}

        {/* Action row */}
        <div className="flex items-center gap-4 pt-2 border-t border-border/40">
          <button
            onClick={onLike}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
            }`}
          >
            <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
            {post.likesCount + (isLiked ? 1 : 0)}
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            {post.commentsCount}
          </button>
          <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors ml-auto">
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4 pt-3 border-t border-border/40 space-y-3">
            {comments?.map((c: any) => (
              <div key={c.id} className="flex gap-2">
                <Avatar className="w-6 h-6 shrink-0">
                  <AvatarImage src={c.authorAvatar ?? undefined} />
                  <AvatarFallback className="text-[9px] bg-muted">{c.authorName[0]}</AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-3 py-2 flex-1">
                  <span className="text-xs font-bold mr-1">{c.authorName}</span>
                  <span className="text-xs text-muted-foreground">{c.comment}</span>
                </div>
              </div>
            ))}
            {isSignedIn && (
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newComment.trim() && addComment.mutate(newComment)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-muted border border-border/50 rounded-full px-3 py-1.5 text-xs outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={!newComment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate(newComment)}
                >
                  Post
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
