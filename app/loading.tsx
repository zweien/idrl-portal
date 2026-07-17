/**
 * Root loading boundary. Shown while a route's data is being prepared on the
 * server (suspense fallback for the initial load of any page).
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        加载中…
      </div>
    </div>
  )
}
