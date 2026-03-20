-- Seed recommended_topics with diverse, interesting claims for the home page
INSERT INTO recommended_topics (title, claim_text, category, description, is_active, sort_order) VALUES
  (
    'Coffee Prevents Alzheimer''s',
    'Drinking coffee daily reduces the risk of Alzheimer''s disease',
    'Health',
    'Does your morning cup offer real neuroprotective benefits?',
    true, 1
  ),
  (
    'Vaccines Cause Autism',
    'Childhood vaccines cause autism spectrum disorder',
    'Health',
    'One of the most persistent and consequential medical myths examined.',
    true, 2
  ),
  (
    '5G Causes Health Problems',
    '5G wireless networks cause cancer and other health problems',
    'Technology',
    'Separating radio-wave science from widespread online fears.',
    true, 3
  ),
  (
    'AI Will Take All Jobs',
    'Artificial intelligence will eliminate most human jobs within a decade',
    'Technology',
    'What does economic research actually say about automation and employment?',
    true, 4
  ),
  (
    'Moon Landing Was Faked',
    'The 1969 Apollo moon landing was staged by NASA',
    'Science',
    'A half-century-old conspiracy theory meets the evidence.',
    true, 5
  ),
  (
    'EVs Worse for the Climate',
    'Electric vehicles produce more carbon emissions than gas cars when accounting for battery production',
    'Environment',
    'Does manufacturing offset the lifetime emissions advantage of EVs?',
    true, 6
  ),
  (
    'Minimum Wage Kills Jobs',
    'Raising the minimum wage significantly increases unemployment',
    'Economics',
    'Decades of economic studies weigh in on wages vs. employment.',
    true, 7
  ),
  (
    'Sugar Causes Hyperactivity',
    'Eating sugar causes hyperactivity in children',
    'Health',
    'Parents swear by it — but what does the research show?',
    true, 8
  ),
  (
    'Voter Fraud Is Widespread',
    'Widespread voter fraud significantly affects US election outcomes',
    'Politics',
    'What audits, court cases, and investigations have actually found.',
    true, 9
  );
