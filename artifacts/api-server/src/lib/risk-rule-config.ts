export const RISK_RULE_WEIGHTS = {
  // Identity/Graph Risks
  identityReuse: 30, // Hashed IP or UserAgent reused excessively
  referralCluster: 50, // Multiple referrals coming from same network graph
  
  // Behavioral Risks
  excessiveCancellations: 20, // Frequent last-minute cancellations
  payoutVelocity: 40, // High velocity of withdrawals
  rapidWalletDrain: 30, // Withdrawing immediately after signup/rewards
  
  // Match Risks
  fakeMatchSignals: 60, // e.g., low external player ratio + fast attendance confirmation
  attendanceDispute: 40, // Match ended in dispute
};

export const RISK_THRESHOLDS = {
  medium: 40,
  high: 75,
  critical: 90,
};

export const WALLET_VELOCITY_LIMITS = {
  newUser: 1000,    // Max daily redemption/wallet usage for new accounts
  verified: 5000,   // Max daily for standard verified users
  trusted: 20000,   // Max daily for trusted users / venue owners
};
