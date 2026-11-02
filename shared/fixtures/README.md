# Golden test vectors

JSON files here hold inputs and expected outputs for the model math. Both the
TypeScript suite (`extension/`) and the Python suite (`priors/`) load the same
files and must reproduce the same outputs, so the two implementations cannot drift.

Any change to model equations must update these fixtures and pass both suites.
