import { UserProfileData } from '../types.ts';

export interface NovaRecommendation {
  id: string;
  type: 'tiny_win' | 'recovery_reminder' | 'overload_warning' | 'reflection_prompt' | 'course_reinforcement';
  content: string;
  sourcesUsed: string[];
  ruleVersion: string;
  requiredGrounding?: boolean;
  sensitivityLevel: 'low' | 'medium' | 'high';
  explanation?: string;
  status: 'draft' | 'verified' | 'rejected';
}

export interface RecommendationLedgerEntry extends NovaRecommendation {
  userId: string;
  timestamp: string;
  userDismissed?: boolean;
  userHelpful?: boolean;
}

export class NovaChallengeMode {
  // Verifies a recommendation draft before sending to the user
  static async verifyRecommendation(draft: Partial<NovaRecommendation>, profile: UserProfileData, checkInsCount: number): Promise<NovaRecommendation> {
    const verified: NovaRecommendation = {
      id: crypto.randomUUID(),
      type: draft.type || 'recovery_reminder',
      content: draft.content || '',
      sourcesUsed: draft.sourcesUsed || [],
      ruleVersion: '1.0',
      sensitivityLevel: draft.sensitivityLevel || 'low',
      status: 'draft',
      explanation: draft.explanation
    };

    // Rule 1: No overclaiming patterns early
    if (checkInsCount < 3 && draft.content?.includes("pattern")) {
      verified.status = 'rejected';
      verified.explanation = 'Rejected: Attempted to claim a pattern with fewer than 3 check-ins.';
      return verified;
    }

    // Rule 2: Respect quiet hours / preferences (simulated check here for consent)
    if (profile.sendNovaNudges === false && ['tiny_win', 'recovery_reminder'].includes(draft.type || '')) {
      verified.status = 'rejected';
      verified.explanation = 'Rejected: User disabled Nova Nudges in Consent Wizard.';
      return verified;
    }

    // Rule 3: Content boundary / Clinical check
    if (draft.content?.toLowerCase().match(/(depression|anxiety disorder|treatment|clinical)/)) {
      verified.status = 'rejected';
      verified.explanation = 'Rejected: Recommendation breached non-medical coaching boundary.';
      return verified;
    }

    // Rule 4: Grounded factual claims check
    if (draft.requiredGrounding && (!draft.sourcesUsed || draft.sourcesUsed.length === 0)) {
       verified.status = 'rejected';
       verified.explanation = 'Rejected: Fact-based recommendation lacked verified sources from Grounded Knowledge Library.';
       return verified;
    }
    
    // Add adaptive style check
    if (profile.nudgeFrequency === 'discreet') {
       if (draft.sensitivityLevel === 'high') {
          // Flatten language intentionally for discreet mode
          verified.content = "A private reflection is available in Blaze Break.";
       }
    }

    verified.status = 'verified';
    if (!verified.explanation) {
       verified.explanation = `Verified: Supported by ${draft.sourcesUsed?.length || 0} user signals.`;
    }

    return verified;
  }
}
