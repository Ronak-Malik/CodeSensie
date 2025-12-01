import { useState, useEffect } from "react";
import "prismjs/themes/prism-tomorrow.css";
import Editor from "react-simple-code-editor";
import prism from "prismjs";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import axios from "axios";
import "./App.css";

function Loader({ text = "Analyzing your code..." }) {
  return (
    <div className="loader-overlay" role="status" aria-live="polite">
      <div className="loader-box">
        <div className="spinner" aria-hidden="true" />
        <div className="loader-text">{text}</div>
      </div>
    </div>
  );
}

function App() {
  const [code, setCode] = useState(`function sum() {
  return 1 + 1
}`);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);
  const [improvedCode, setImprovedCode] = useState("");
  const [badCode, setBadCode] = useState("");
  const [copiedInline, setCopiedInline] = useState(false);

  useEffect(() => {
    prism.highlightAll();
  }, []);

  useEffect(() => {
    if (improvedCode || badCode) {
      setTimeout(() => prism.highlightAll(), 40);
    }
  }, [improvedCode, badCode]);

  function extractFencedBlocks(text) {
    const re = /```(?:[\w+-]*)\n([\s\S]*?)```/g;
    const blocks = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      blocks.push(m[1].trim());
    }
    return blocks;
  }

  function findLabeledBlock(text, label) {
    const re = new RegExp(label + "[\\s\\S]{0,200}?```(?:[\\w+-]*)\\n([\\s\\S]*?)```", "i");
    const match = re.exec(text);
    return match && match[1] ? match[1].trim() : "";
  }

  function findInlineCodeAfterLabel(text, label) {
    const re = new RegExp(label + "[:\\s\\-]*\\n?\\s*([\\s\\S]{1,1000}?)(?=\\n\\n|$)", "i");
    const match = re.exec(text);
    if (!match) return "";
    const maybe = match[1].trim();
    if (maybe.startsWith("```")) {
      const fenced = /```(?:[\w+-]*)\n([\s\S]*?)```/.exec(maybe);
      return fenced && fenced[1] ? fenced[1].trim() : "";
    }
    return "";
  }

  function removeLabeledBlocks(text, labels = ["Recommended Fix", "Improved Code", "Bad Code"]) {
    let out = text;
    labels.forEach((label) => {
      const re = new RegExp(label + "[\\s\\S]{0,200}?```(?:[\\w+-]*)\\n([\\s\\S]*?)```", "gi");
      out = out.replace(re, "");
    });
    const fencedRe = /```(?:[\w+-]*)\n[\s\S]*?```/g;
    out = out.replace(fencedRe, "");
    return out.trim();
  }

  function parseReview(rawText, objImproved) {
    const preferredLabels = ["Recommended Fix", "Recommended Fix:", "Improved Code", "Suggested Fix", "Fix", "Bad Code"];
    let improved = "";
    let bad = "";
    if (objImproved && typeof objImproved === "string" && objImproved.trim()) {
      improved = objImproved.trim();
    }
    for (let label of preferredLabels) {
      if (!improved) {
        const found = findLabeledBlock(rawText, label);
        if (found) improved = found;
        else {
          const inline = findInlineCodeAfterLabel(rawText, label);
          if (inline) improved = inline;
        }
      }
      if (!bad && /Bad Code/i.test(label)) {
        const b = findLabeledBlock(rawText, "Bad Code");
        if (b) bad = b;
      }
    }
    if (!improved) {
      const blocks = extractFencedBlocks(rawText);
      if (blocks.length >= 1) improved = blocks[0];
      if (blocks.length >= 2) bad = blocks[1];
    }
    if (!bad) {
      const blocks = extractFencedBlocks(rawText);
      if (blocks.length >= 2) bad = blocks[1];
    }
    return { improved: improved || "", bad: bad || "" };
  }

  async function reviewCode() {
    try {
      setLoading(true);
      setReview("");
      setImprovedCode("");
      setBadCode("");
      setCopiedInline(false);

      const response = await axios.post("http://localhost:3000/ai/get-review", { code }, { timeout: 120000 });

      const respData = response.data;
      const rawText =
        respData?.review ??
        (typeof respData === "string" ? respData : JSON.stringify(respData, null, 2));

      const objImproved = respData && typeof respData === "object" ? respData.improvedCode || "" : "";

      const parsed = parseReview(rawText, objImproved);

      setImprovedCode(parsed.improved);
      setBadCode(parsed.bad);
      const cleaned = removeLabeledBlocks(rawText, ["Recommended Fix", "Improved Code", "Bad Code", "Fix", "Suggested Fix"]);
      setReview(cleaned);
    } catch (err) {
      console.error("Error fetching review:", err);
      setReview("⚠️ There was an error getting the review. Check the console and ensure your backend is running.");
      setImprovedCode("");
      setBadCode("");
    } finally {
      setLoading(false);
      setTimeout(() => prism.highlightAll(), 60);
    }
  }

  async function copyImprovedCode() {
    if (!improvedCode) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(improvedCode);
      } else {
        const ta = document.createElement("textarea");
        ta.value = improvedCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedInline(true);
      setTimeout(() => setCopiedInline(false), 1600);
    } catch (err) {
      console.error("Copy failed:", err);
      alert("Copy failed. Please select the code and press Ctrl+C / Cmd+C.");
    }
  }

  return (
    <>
      {loading && <Loader text="Analyzing your code..." />}

      <main>
        <div className="left">
          <div className="code">
            <Editor
              value={code}
              onValueChange={(val) => setCode(val)}
              highlight={(codeToHighlight) => prism.highlight(codeToHighlight, prism.languages.javascript, "javascript")}
              padding={10}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 16,
                border: "1px solid #ddd",
                borderRadius: "5px",
                height: "100%",
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          <button className="review" onClick={reviewCode} disabled={loading} aria-disabled={loading} aria-busy={loading} type="button">
            {loading ? "Reviewing..." : "Review"}
          </button>
        </div>

        <div className="right">
          {improvedCode ? (
            <div className="improved-wrapper">
              <div className="improved-header">
                <div className="improved-title">Recommended Fix</div>
                <button className={`copy-inline-btn ${copiedInline ? "copied" : ""}`} onClick={copyImprovedCode} type="button" aria-label={copiedInline ? "Copied" : "Copy improved code"}>
                  {copiedInline ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="copy-text">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M16 8v10H6V8h10zm1-4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="copy-text">Copy</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="improved-block" aria-label="Improved code block">
                <code className="language-javascript">{improvedCode}</code>
              </pre>
            </div>
          ) : null}

          {badCode ? (
            <div className="bad-wrapper">
              <div className="bad-header">
                <div className="bad-title">Bad Code</div>
              </div>
              <pre className="bad-block" aria-label="Bad code block">
                <code className="language-javascript">{badCode}</code>
              </pre>
            </div>
          ) : null}

          <Markdown rehypePlugins={[rehypeHighlight]}>{review}</Markdown>
        </div>
      </main>
    </>
  );
}

export default App;
