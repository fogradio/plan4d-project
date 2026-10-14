document
  .getElementById("copy-citation")
  ?.addEventListener("click", async () => {
    const content = document.getElementById("citation-text")!;
    const status = document.getElementById("copy-status")!;
    try {
      await navigator.clipboard.writeText(content.textContent ?? "");
      status.textContent = "Copied to clipboard";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(content);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      status.textContent = "BibTeX selected";
    }
  });
