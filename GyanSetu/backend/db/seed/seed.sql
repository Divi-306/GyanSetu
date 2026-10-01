-- GyanSetu seed data. Idempotent: safe to run more than once.
-- Course/lesson ids match the app's hardcoded data (courses.tsx / starter-bundle.tsx).

-- Courses (ids = the ids already used in courses.tsx / starter-bundle.tsx)
INSERT INTO courses (id, title, subtitle, description, subject_area, semester, icon, sort_order, is_published) VALUES
  ('python',      'Python Basics',                'For Beginners', 'Variables, control flow, functions and lists in Python.', 'Programming', NULL, '🐍', 1, true),
  ('dbms',        'DBMS',                         'Semester 1',    'DBMS concepts, SQL & databases.',                           'Databases',   1,    '🗄️', 2, true),
  ('cn',          'Computer Networks',            'Semester 2',    'Networking fundamentals & protocols.',                      'Networking',  2,    '🌐', 3, true),
  ('os',          'Operating System',             'Semester 2',    'Processes, memory & file systems.',                          'Systems',     2,    '⚙️', 4, true),
  ('dsa',         'Data Structures & Algorithms', 'Semester 2',    'Arrays, strings, linked lists & more.',                     'Programming', 2,    '🧬', 5, true),
  ('programming', 'Programming Fundamentals',     'Starter',       'Core programming concepts.',                                 'Programming', NULL, '💻', 6, false)
ON CONFLICT (id) DO NOTHING;

-- Lessons (is_sample = true → part of the Starter Bundle)
INSERT INTO lessons (course_id, position, title, content_type, body_md, duration_min, is_sample) VALUES
('python', 1, 'Introduction to Python', 'markdown', $md$
# Introduction to Python

Python is a high-level programming language known for readable code. It is used in web development, data science, automation and AI.

## Your first program

```python
print("Namaste, GyanSetu!")
```

`print()` shows text on the screen. Text inside quotes is called a **string**.
$md$, 5, false),
('python', 2, 'Variables and Data Types', 'markdown', $md$
# Variables and Data Types

A **variable** is a name that stores a value: `age = 19`.

Common types: `int` (19), `float` (7.5), `str` ("Asha"), `bool` (True/False).

Use `type(x)` to check a value's type.
$md$, 8, false),
('python', 3, 'Lists and Tuples', 'markdown', $md$
# Lists and Tuples

A **list** is ordered and *mutable*: `marks = [78, 91, 66]`; `marks.append(88)` adds an item.

A **tuple** is ordered and *immutable*: `point = (3, 4)`. You cannot change a tuple after creating it.

Use a tuple for fixed data (coordinates, RGB colours) and a list when items will change.
$md$, 8, false),

('programming', 1, 'What is a Program?', 'markdown', $md$
# What is a Program?

A program is a list of instructions a computer follows step by step. An **algorithm** is the plan; the **program** is that plan written in a programming language.
$md$, 5, true),
('programming', 2, 'Variables, Input and Output', 'markdown', $md$
# Variables, Input and Output

Programs take **input**, process it, and produce **output**. Variables hold values while the program runs.
$md$, 6, true),

('dsa', 1, 'Arrays', 'markdown', $md$
# Arrays

An array stores items of the same type in contiguous memory. Access by index is O(1); inserting in the middle is O(n) because items must shift.
$md$, 6, true),
('dsa', 2, 'Linked Lists', 'markdown', $md$
# Linked Lists

A linked list is a chain of nodes; each node stores data and a pointer to the next node. Insertion at the head is O(1); searching is O(n).
$md$, 7, true),

('dbms', 1, 'What is a DBMS?', 'markdown', $md$
# What is a DBMS?

A Database Management System stores, retrieves and manages data. It gives data independence, concurrency control, security and backup — which plain files do not.
$md$, 6, true),
('dbms', 2, 'Keys in DBMS', 'markdown', $md$
# Keys in DBMS

A **primary key** uniquely identifies each row. A **foreign key** refers to the primary key of another table and links the two tables.
$md$, 6, true),

('cn', 1, 'The OSI Model', 'markdown', $md$
# The OSI Model

Seven layers: Physical, Data Link, Network, Transport, Session, Presentation, Application. Mnemonic: "Please Do Not Throw Sausage Pizza Away".
$md$, 7, true),
('cn', 2, 'TCP vs UDP', 'markdown', $md$
# TCP vs UDP

TCP is connection-oriented and reliable (web, email). UDP is connectionless and fast but unreliable (video calls, games, DNS).
$md$, 6, true),

('os', 1, 'Processes and Threads', 'markdown', $md$
# Processes and Threads

A **process** is a program in execution with its own memory. A **thread** is a lightweight unit inside a process that shares the process's memory.
$md$, 7, true),
('os', 2, 'CPU Scheduling', 'markdown', $md$
# CPU Scheduling

The scheduler decides which process runs next. Common algorithms: FCFS, SJF, Round Robin (time quantum), Priority scheduling.
$md$, 7, true)
ON CONFLICT (course_id, position) DO NOTHING;

-- Python quiz (5 questions)
WITH q AS (
  INSERT INTO quizzes (course_id, title, is_sample) VALUES ('python', 'Python Basics — Quiz 1', false)
  ON CONFLICT (course_id, title) DO NOTHING
  RETURNING id
)
INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
SELECT q.id, v.position, v.prompt, v.options::jsonb, v.correct_index, v.explanation
FROM q, (VALUES
  (1, 'Which function prints text on the screen?', '["echo()", "print()", "show()", "write()"]', 1, 'print() writes output to the screen.'),
  (2, 'What is the type of 7.5?', '["int", "str", "float", "bool"]', 2, 'Numbers with a decimal point are floats.'),
  (3, 'Which of these is immutable?', '["list", "tuple", "dict", "set"]', 1, 'Tuples cannot be changed after creation.'),
  (4, 'What does marks.append(88) do?', '["Removes 88", "Adds 88 to the end", "Sorts the list", "Nothing"]', 1, 'append() adds one item at the end of a list.'),
  (5, 'Which keyword defines a function?', '["func", "def", "function", "lambda"]', 1, 'def starts a function definition.')
) AS v(position, prompt, options, correct_index, explanation);

-- One sample quiz per starter subject (demo quiz), example for DSA:
WITH q AS (
  INSERT INTO quizzes (course_id, title, is_sample) VALUES ('dsa', 'DSA — Demo Quiz', true)
  ON CONFLICT (course_id, title) DO NOTHING RETURNING id
)
INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
SELECT q.id, v.position, v.prompt, v.options::jsonb, v.correct_index, v.explanation
FROM q, (VALUES
  (1, 'Time to access an array element by index?', '["O(1)", "O(n)", "O(log n)", "O(n^2)"]', 0, 'Direct index access is constant time.'),
  (2, 'Each linked-list node stores data and…', '["an index", "a pointer to the next node", "a hash", "a key"]', 1, 'Nodes are chained by pointers.')
) AS v(position, prompt, options, correct_index, explanation);

-- Scholarships: SAMPLE DATA for development. Replace with verified real schemes before launch.
INSERT INTO scholarships (name, provider, description, amount_text, eligibility_rules, apply_url, source_url, last_verified_at) VALUES
('Post-Matric Scholarship for SC Students (sample)', 'Government of India (sample)',
 'Support for SC students studying after Class 10.', 'Tuition + maintenance allowance',
 '{"all":[{"field":"category","op":"in","value":["SC"],"label":"Belongs to Scheduled Caste category"},
          {"field":"annualFamilyIncome","op":"lte","value":250000,"label":"Family income up to ₹2.5 lakh/year"},
          {"field":"educationLevel","op":"in","value":["diploma","undergraduate","postgraduate"],"label":"Studying after Class 10"}]}',
 'https://scholarships.gov.in', 'https://scholarships.gov.in', now()),
('Scholarship for Girls in Technical Education (sample)', 'Sample Foundation',
 'For girl students in diploma or degree technical courses.', 'Up to ₹50,000 / year',
 '{"all":[{"field":"gender","op":"eq","value":"female","label":"Girl student"},
          {"field":"educationLevel","op":"in","value":["diploma","undergraduate"],"label":"Diploma or undergraduate student"},
          {"field":"annualFamilyIncome","op":"lte","value":800000,"label":"Family income up to ₹8 lakh/year"}]}',
 'https://scholarships.gov.in', 'https://scholarships.gov.in', now()),
('Scholarship for Students with Disabilities (sample)', 'Sample Trust',
 'For students with a certified disability.', 'Up to ₹30,000 / year',
 '{"all":[{"field":"isPwd","op":"eq","value":true,"label":"Person with disability (certificate required)"}]}',
 'https://scholarships.gov.in', 'https://scholarships.gov.in', now()),
('OBC / EWS Merit Support (sample)', 'Sample State Board',
 'For OBC and EWS students with limited family income.', '₹12,000 / year',
 '{"all":[{"field":"category","op":"in","value":["OBC","EWS"],"label":"OBC or EWS category"},
          {"field":"annualFamilyIncome","op":"lte","value":250000,"label":"Family income up to ₹2.5 lakh/year"}]}',
 'https://scholarships.gov.in', 'https://scholarships.gov.in', now())
ON CONFLICT (name) DO NOTHING;

-- Career paths
INSERT INTO career_paths (id, name, description, course_sequence, skills, interest_tags, outcomes) VALUES
('software-developer', 'Software Developer', 'Build apps and websites.',
 ARRAY['programming','python','dsa','dbms'], ARRAY['Python','Problem solving','SQL','Git'], ARRAY['coding','apps','web'],
 'Junior developer / internship roles'),
('data-analyst', 'Data Analyst', 'Turn data into decisions.',
 ARRAY['python','dbms'], ARRAY['Python','SQL','Excel','Statistics'], ARRAY['data','maths','analytics'],
 'Data analyst / MIS executive'),
('network-engineer', 'Network Engineer', 'Design and run computer networks.',
 ARRAY['cn','os'], ARRAY['TCP/IP','Routing','Linux','Troubleshooting'], ARRAY['networking','hardware'],
 'Network support / NOC engineer'),
('systems-engineer', 'Systems Engineer', 'Keep servers and operating systems healthy.',
 ARRAY['programming','os','cn'], ARRAY['Linux','Shell scripting','Networking'], ARRAY['systems','linux','cloud'],
 'System administrator / cloud support')
ON CONFLICT (id) DO NOTHING;

-- Demo quizzes for the remaining Starter Bundle subjects
WITH q AS (
  INSERT INTO quizzes (course_id, title, is_sample) VALUES ('programming', 'Programming — Demo Quiz', true)
  ON CONFLICT (course_id, title) DO NOTHING RETURNING id
)
INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
SELECT q.id, v.position, v.prompt, v.options::jsonb, v.correct_index, v.explanation
FROM q, (VALUES
  (1, 'An algorithm is…', '["a programming language", "a step-by-step plan to solve a problem", "a computer part", "an error"]', 1, 'The algorithm is the plan; the program is that plan written in code.'),
  (2, 'What does a variable do?', '["Stores a value", "Prints text", "Stops the program", "Draws a chart"]', 0, 'Variables hold values while the program runs.')
) AS v(position, prompt, options, correct_index, explanation);

WITH q AS (
  INSERT INTO quizzes (course_id, title, is_sample) VALUES ('dbms', 'DBMS — Demo Quiz', true)
  ON CONFLICT (course_id, title) DO NOTHING RETURNING id
)
INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
SELECT q.id, v.position, v.prompt, v.options::jsonb, v.correct_index, v.explanation
FROM q, (VALUES
  (1, 'Which key uniquely identifies each row?', '["Foreign key", "Primary key", "Index", "View"]', 1, 'A primary key is unique for every row.'),
  (2, 'A foreign key…', '["encrypts data", "links to the primary key of another table", "sorts a table", "deletes rows"]', 1, 'Foreign keys link two tables together.')
) AS v(position, prompt, options, correct_index, explanation);

WITH q AS (
  INSERT INTO quizzes (course_id, title, is_sample) VALUES ('cn', 'Computer Networks — Demo Quiz', true)
  ON CONFLICT (course_id, title) DO NOTHING RETURNING id
)
INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
SELECT q.id, v.position, v.prompt, v.options::jsonb, v.correct_index, v.explanation
FROM q, (VALUES
  (1, 'How many layers does the OSI model have?', '["4", "5", "7", "9"]', 2, 'Physical, Data Link, Network, Transport, Session, Presentation, Application.'),
  (2, 'Which protocol is connectionless?', '["TCP", "UDP", "HTTP", "FTP"]', 1, 'UDP sends without setting up a connection.')
) AS v(position, prompt, options, correct_index, explanation);

WITH q AS (
  INSERT INTO quizzes (course_id, title, is_sample) VALUES ('os', 'Operating System — Demo Quiz', true)
  ON CONFLICT (course_id, title) DO NOTHING RETURNING id
)
INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation)
SELECT q.id, v.position, v.prompt, v.options::jsonb, v.correct_index, v.explanation
FROM q, (VALUES
  (1, 'Threads inside one process share…', '["nothing", "the process''s memory", "a CPU core each", "separate files"]', 1, 'Threads are lightweight and share their process''s memory.'),
  (2, 'Which scheduling algorithm uses a time quantum?', '["FCFS", "SJF", "Round Robin", "Priority"]', 2, 'Round Robin gives each process a fixed time slice in turn.')
) AS v(position, prompt, options, correct_index, explanation);
