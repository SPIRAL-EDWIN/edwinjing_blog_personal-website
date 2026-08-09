# Lab Projects source basic-fix changelog

Scope: only user-approved basic corrections were applied to the private Obsidian sources. Public redaction, warning cards, experiment-number removal, and site-only editorial changes are excluded from this phase.

- Hand-eye calibration: removed a duplicated word, closed a parenthesis, corrected `推倒` to `推导到`, repaired quotation/list formatting, clarified the approved non-degenerate pose heuristic, corrected the homogeneous row to `[0, 0, 0, 1]`, and fixed basic wording. The user-protected formula and TCP passages were otherwise preserved.
- MDP: removed an empty list item, corrected `有框架` to `由框架`, corrected `RewardsCfg`, and updated the referenced `__init__.py` spelling. The `_loco_mani_scale` and step-order bodies were preserved.
- RFM: corrected MuJoCo, Markdown/code indentation and fence languages, Chinese punctuation/typos, `gym.make`, task command syntax, `__init__.py`, and `元组`.
- Robot asset note: corrected all `__init__.py` spellings and renamed the source file accordingly; the inbound RFM wikilink was updated.
- TensorBoard/W&B: inserted the missing `&&` command separator only; private source credentials were not changed.
- Matrix Studio: corrected `apt`, removed invalid Markdown wrappers from shell URLs, fixed a heading space and punctuation. Credentials and higher-order safety content remain source-private/site-only.
- Diffusion Policy training: corrected `vio_result.json`, a leading Markdown space, and a shell-unsafe task placeholder.
- Diffusion Policy checkpoint evaluation: added the missing `bash` fence language, punctuation, and deployment-link wording.
- Sim2Sim: corrected paths/extensions, Python import syntax, CLI option spelling, ONNX filenames, wording, fence language, and the missing `--` prefix.
- UMI-on-Tron: corrected fence languages, `ios_train.py`, `__init__.py`, a broken multiline environment-variable command, a heading typo, trailing whitespace after `\\`, and task syntax.
- Isaac Lab RTX50: corrected fence languages, punctuation, units, spelling, VS Code/GitHub wording, `train_levels`, and two basic explanatory sentence errors.
- Follow-up approved fixes: corrected MDP `decay_length`, `env.step`, and `observations.py`; converted UMI-on-Tron, Sim2Sim, and Matrix Studio shell placeholders to quoted variables with guards where needed; generalized the opening UMI-on-Tron environment as `<CONDA_ENV>`; and synchronized the completed hand-eye block reference into the public copy.
- Bash guide follow-up: inserted the missing blank lines around the option table, note block, code fence, and next heading so the source no longer treats subsequent content as table rows.

Still unchanged because its intent is uncertain: Matrix prompt fence classification.

Baseline and post-fix hashes are stored in `.codex/lab-projects-source-baseline.sha256` and `.codex/lab-projects-source-postfix.sha256`.
