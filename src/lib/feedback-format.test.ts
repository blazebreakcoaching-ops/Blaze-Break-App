import { describe, it, expect } from "vitest";
import { formatFeedbackCategory } from "./feedback-format";

describe("formatFeedbackCategory", () => {
  it("formats each category into a readable label", () => {
    expect(formatFeedbackCategory("general")).toBe("General Feedback");
    expect(formatFeedbackCategory("bug")).toBe("Bug Report");
    expect(formatFeedbackCategory("feature_request")).toBe("Feature Request");
    expect(formatFeedbackCategory("testimonial")).toBe("Testimonial");
  });
});
