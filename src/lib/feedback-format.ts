export type FeedbackCategory = 'general' | 'bug' | 'feature_request' | 'testimonial';

export function formatFeedbackCategory(category: FeedbackCategory): string {
  switch (category) {
    case 'general': return 'General Feedback';
    case 'bug': return 'Bug Report';
    case 'feature_request': return 'Feature Request';
    case 'testimonial': return 'Testimonial';
  }
}
