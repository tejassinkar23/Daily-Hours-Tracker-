// Simple JavaScript for form handling
document.getElementById('show-register').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'block';
    clearMessages();
});

document.getElementById('show-login').addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('login-section').style.display = 'block';
    clearMessages();
});

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData(this);
    const data = {
        ps_number: formData.get('ps_number'),
        password: formData.get('password')
    };

    console.log('Attempting login for:', data.ps_number);
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('Login response:', result);
        
        if (result.success) {
            // Store user data in localStorage
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            console.log('User data stored, redirecting to dashboard...');
            // Redirect to dashboard
            window.location.href = '/dashboard';
        } else {
            showMessage('login-message', result.message, 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('login-message', 'Login failed. Please try again.', 'error');
    }
});

document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const formData = new FormData(this);
    const data = {
        ps_number: formData.get('ps_number'),
        name: formData.get('name'),
        password: formData.get('password')
    };

    console.log('Attempting registration for:', data.ps_number);
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('Registration response:', result);
        
        if (result.success) {
            showMessage('register-message', result.message, 'success');
            setTimeout(() => {
                document.getElementById('register-section').style.display = 'none';
                document.getElementById('login-section').style.display = 'block';
                document.getElementById('register-form').reset();
                clearMessages();
            }, 2000);
        } else {
            showMessage('register-message', result.message, 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showMessage('register-message', 'Registration failed. Please try again.', 'error');
    }
});

function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';
}

function clearMessages() {
    document.querySelectorAll('.message').forEach(msg => {
        msg.textContent = '';
        msg.className = 'message';
        msg.style.display = 'none';
    });
}