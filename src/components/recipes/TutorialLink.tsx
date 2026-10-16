export function TutorialLink({
  name,
  language = "Hindi",
}: {
  name: string;
  language?: string;
}) {
  return (
    <a
      className="button secondary"
      href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} recipe ${language}`)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Watch Tutorial
    </a>
  );
}
