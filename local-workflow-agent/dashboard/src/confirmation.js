window.askConfirmation = async function askConfirmation(message) {
  const id = crypto.randomUUID();
  const post = async (route, body) => {
    const response = await fetch('/api/remote/' + route, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Local-Agent-Session': document.querySelector('meta[name=local-agent-session]').content },
      body: JSON.stringify({ id, ...body }) });
    if (!response.ok) throw Error('Không gửi được yêu cầu xác nhận.');
    return response.json();
  };
  const dialog = document.createElement('dialog');
  const question = document.createElement('p');
  question.id = 'confirmation-' + id;
  dialog.setAttribute('aria-labelledby', question.id);
  question.textContent = message;
  dialog.append(question);
  const answer = proceed => post('prompt-answer', { proceed }).catch(error => window.toast.error(error.message));
  for (const [label, proceed] of [['Yes', true], ['No', false]]) {
    const button = document.createElement('button');
    button.textContent = label;
    button.onclick = () => answer(proceed);
    dialog.append(button);
  }
  dialog.oncancel = event => { event.preventDefault(); answer(false); };
  document.body.append(dialog);
  dialog.showModal();
  try { return (await post('prompt-open', { message })).proceed; }
  catch (error) { window.toast.error(error.message); return false; }
  finally { dialog.remove(); }
};
