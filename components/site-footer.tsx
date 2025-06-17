export function SiteFooter() {
  return (
    <footer className="border-grid border-t py-6">
      <div className="container-wrapper">
        <div className="container py-4 flex flex-col items-center justify-center">
          <div className="text-balance text-center text-sm leading-loose text-muted-foreground">
            Built by{" "}
            <a
              href="https://oceanintegrity.ai"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Ocean Integrity Team
            </a>
            . Try the{" "}
            <a
              href="https://demo.oceanintegrity.ai"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              live demo
            </a>
            . The source code is available on{" "}
            <a
              href="https://github.com/Sick0stro/ocean_integrity"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              GitHub
            </a>
            .
          </div>
        </div>
      </div>
    </footer>
  );
}