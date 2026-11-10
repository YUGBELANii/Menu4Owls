'use strict';
(function(){
  const loginView=document.getElementById('login-view');
  const adminView=document.getElementById('admin-view');
  if(!loginView||!adminView||!window.supabaseClient)return;
  const show=async()=>{
    const{data,error}=await supabaseClient.auth.getSession();
    if(error)console.error('Admin session check failed:',error);
    const session=data?.session;
    loginView.style.display=session?'none':'block';
    adminView.style.display=session?'':'none';
    const who=document.getElementById('who-label');
    if(who&&session)who.textContent=session.user.email||'';
  };
  supabaseClient.auth.onAuthStateChange((_event,session)=>{
    if(session)setTimeout(show,0);
    else{loginView.style.display='block';adminView.style.display='none';}
  });
  document.getElementById('login-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=document.getElementById('login-btn');
    const status=document.getElementById('login-status');
    button.disabled=true;button.textContent='Logging in…';
    try{
      const{error}=await supabaseClient.auth.signInWithPassword({email:document.getElementById('login-email').value.trim(),password:document.getElementById('login-password').value});
      if(error)throw error;
      await show();
    }catch(error){status.textContent=error.message||'Login failed.';status.className='status-msg show err';}
    finally{button.disabled=false;button.textContent='Log in';}
  });
  document.getElementById('logout-btn')?.addEventListener('click',async()=>{
    const{error}=await supabaseClient.auth.signOut();
    if(error)alert(`Could not log out: ${error.message}`);
    await show();
  });
  show();
})();
