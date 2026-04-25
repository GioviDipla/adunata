import { redirect } from 'next/navigation'

// Collection now lives as a tab inside `/cards`. Keep the legacy URL alive
// as a server-side redirect so old bookmarks and external links keep
// resolving to the right place.
export default function CollectionPage() {
  redirect('/cards?tab=collection')
}
