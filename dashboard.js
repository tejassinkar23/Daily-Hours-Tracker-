class Dashboard {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        this.checkAuthentication();
        this.bindEvents();
        this.setDefaultDate();
    }

    checkAuthentication() {
        const userData = localStorage.getItem('currentUser');
        if (!userData) {
            window.location.href = '/';
            return;
        }

        this.currentUser = JSON.parse(userData);
        document.getElementById('welcome-message').textContent = `Hello, ${this.currentUser.name}!`;
    }

    bindEvents() {
        // Form submission
        document.getElementById('time-entry-form').addEventListener('submit', (e) => this.saveTimeEntry(e));
        
        // Input changes for auto-calculation
        const numberInputs = document.querySelectorAll('input[type="number"]');
        numberInputs.forEach(input => {
            input.addEventListener('input', () => this.calculateHours());
        });

        // Buttons
        document.getElementById('clear-btn').addEventListener('click', () => this.clearForm());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('view-entries-btn').addEventListener('click', () => this.showEntries());
        
        // Modal
        document.querySelector('.close').addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('entries-modal')) {
                this.closeModal();
            }
        });

        // Date change - load existing entry
        document.getElementById('date').addEventListener('change', () => this.loadTimeEntry());
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
        this.loadTimeEntry();
    }

    calculateHours() {
        // Billable projects
        const billableProjects = [
            'komatsu', 'brunswick', 'abb_india', 'omnion', 'rinnai', 
            'oshkosh', 'polaris', 'volvo', 'bridgestone', 'wartsila_uk', 'mtu', 'mhi'
        ];

        let totalBillable = 0;
        billableProjects.forEach(project => {
            const value = parseFloat(document.getElementById(project).value) || 0;
            totalBillable += value;
        });

        // Other hours
        const freeHours = parseFloat(document.getElementById('free_hours').value) || 0;
        const nonBillableHours = parseFloat(document.getElementById('non_billable_hours').value) || 0;
        const trainingHours = parseFloat(document.getElementById('training_hours').value) || 0;

        const totalOther = freeHours + nonBillableHours + trainingHours;
        const grandTotal = totalBillable + totalOther;
        const availableHours = 8 - grandTotal;

        // Update displays
        document.getElementById('total-billable').textContent = totalBillable.toFixed(1);
        document.getElementById('total-other').textContent = totalOther.toFixed(1);
        document.getElementById('grand-total').textContent = grandTotal.toFixed(1);
        document.getElementById('available_hours').value = availableHours.toFixed(1);

        // Color coding for available hours
        const availableHoursInput = document.getElementById('available_hours');
        if (availableHours < 0) {
            availableHoursInput.style.backgroundColor = '#f8d7da';
            availableHoursInput.style.color = '#721c24';
        } else if (availableHours === 0) {
            availableHoursInput.style.backgroundColor = '#fff3cd';
            availableHoursInput.style.color = '#856404';
        } else {
            availableHoursInput.style.backgroundColor = '#d4edda';
            availableHoursInput.style.color = '#155724';
        }
    }

    async loadTimeEntry() {
        const date = document.getElementById('date').value;
        if (!date) return;

        try {
            const response = await fetch(`/time-entry/${this.currentUser.id}/${date}`);
            const result = await response.json();

            if (result.success && result.entry) {
                this.populateForm(result.entry);
                this.showMessage('Entry loaded for this date', 'success');
            } else {
                this.clearForm(false); // Don't clear date
            }
        } catch (error) {
            console.error('Error loading time entry:', error);
        }
    }

    populateForm(entry) {
        const fields = [
            'komatsu', 'brunswick', 'abb_india', 'omnion', 'rinnai', 'oshkosh',
            'polaris', 'volvo', 'bridgestone', 'wartsila_uk', 'mtu', 'mhi',
            'free_hours', 'non_billable_hours', 'training_hours', 'remarks'
        ];

        fields.forEach(field => {
            const element = document.getElementById(field);
            if (element && entry[field] !== undefined && entry[field] !== null) {
                element.value = entry[field];
            }
        });

        this.calculateHours();
    }

    async saveTimeEntry(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const data = {
            userId: this.currentUser.id,
            date: formData.get('date')
        };

        // Collect all project hours
        const projects = [
            'komatsu', 'brunswick', 'abb_india', 'omnion', 'rinnai', 'oshkosh',
            'polaris', 'volvo', 'bridgestone', 'wartsila_uk', 'mtu', 'mhi',
            'free_hours', 'non_billable_hours', 'training_hours'
        ];

        projects.forEach(project => {
            data[project] = parseFloat(formData.get(project)) || 0;
        });

        data.remarks = formData.get('remarks');

        // Validate total hours
        this.calculateHours();
        const availableHours = parseFloat(document.getElementById('available_hours').value);
        
        if (availableHours < 0) {
            this.showMessage('Total hours exceed 8 hours! Please adjust your entries.', 'error');
            return;
        }

        try {
            const response = await fetch('/save-time-entry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('Time entry saved successfully!', 'success');
            } else {
                this.showMessage(result.message, 'error');
            }
        } catch (error) {
            console.error('Error saving time entry:', error);
            this.showMessage('Failed to save time entry', 'error');
        }
    }

    clearForm(clearDate = true) {
        const form = document.getElementById('time-entry-form');
        if (clearDate) {
            form.reset();
            this.setDefaultDate();
        } else {
            const inputs = form.querySelectorAll('input[type="number"], textarea');
            inputs.forEach(input => {
                if (input.id !== 'date' && input.id !== 'available_hours') {
                    input.value = '';
                }
            });
            document.getElementById('remarks').value = '';
        }
        this.calculateHours();
        this.showMessage('Form cleared', 'success');
    }

    async showEntries() {
        try {
            const response = await fetch(`/time-entries/${this.currentUser.id}`);
            const result = await response.json();

            if (result.success) {
                this.displayEntries(result.entries);
                document.getElementById('entries-modal').style.display = 'block';
            } else {
                this.showMessage('Failed to load entries', 'error');
            }
        } catch (error) {
            console.error('Error loading entries:', error);
            this.showMessage('Failed to load entries', 'error');
        }
    }

    displayEntries(entries) {
        const container = document.getElementById('entries-list');
        
        if (entries.length === 0) {
            container.innerHTML = '<p>No time entries found.</p>';
            return;
        }

        container.innerHTML = entries.map(entry => `
            <div class="entry-item">
                <div class="entry-header">
                    <span class="entry-date">${new Date(entry.date).toLocaleDateString()}</span>
                    <span class="available-hours">Available: ${entry.available_hours} hrs</span>
                </div>
                <div class="entry-hours">
                    <div class="hour-item"><span>Billable Total:</span> <span>${this.calculateBillableTotal(entry)} hrs</span></div>
                    <div class="hour-item"><span>Non-Billable:</span> <span>${entry.non_billable_hours} hrs</span></div>
                    <div class="hour-item"><span>Training:</span> <span>${entry.training_hours} hrs</span></div>
                    <div class="hour-item"><span>Free:</span> <span>${entry.free_hours} hrs</span></div>
                </div>
                ${entry.remarks ? `<div class="entry-remarks"><strong>Remarks:</strong> ${entry.remarks}</div>` : ''}
            </div>
        `).join('');
    }

    calculateBillableTotal(entry) {
        const billableFields = [
            'komatsu', 'brunswick', 'abb_india', 'omnion', 'rinnai', 'oshkosh',
            'polaris', 'volvo', 'bridgestone', 'wartsila_uk', 'mtu', 'mhi'
        ];
        
        return billableFields.reduce((total, field) => total + (parseFloat(entry[field]) || 0), 0);
    }

    closeModal() {
        document.getElementById('entries-modal').style.display = 'none';
    }

    logout() {
        localStorage.removeItem('currentUser');
        window.location.href = '/';
    }

    showMessage(message, type) {
        const messageEl = document.getElementById('message');
        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';

        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});