/* Magic Mirror
 * Module: MMM-LoadShedding
 *
 * By
 * MIT Licensed.
 */
Module.register("MMM-LoadShedding", {

    defaults: {
        // The default interval (in milliseconds) between updates of the module
        updateInterval: 1000 * 60 * 30, // 30 minutes

        // The default delay (in milliseconds) between retries of failed update attempts
        retryDelay: 1000 * 60 * 30 // 30 minutes
    },

    requiresVersion: "2.1.0", // Required version of MagicMirror

    start() {
        // Initialize variables
        this.loaded = false;
        let dataRequest, dataNotification;

        // Fetch initial data
        this.getData();

        // Schedule periodic updates
        setInterval(
            // Call updateDom method with the correct 'this' context
            this.updateDom.bind(this),
            // Set the interval between updates to the configured value
            this.config.updateInterval
        );
    },


    /*
     * This method sends a GET request to an API endpoint, parses the response body as JSON,
     * and passes the resulting data to the processData method of the current object.
     * If the response status is not OK (i.e., not in the range 200-299),
     * it logs an error message to the console and sets a retry flag to false to prevent retrying the request.
     * If the retry flag is still true, it calculates a delay based on the current state (i.e., whether the data has been loaded at least once),
     * and schedules an update of the data (or a retry of the request) using the scheduleUpdate method of the current object.
     * This method is asynchronous and uses await to wait for the response from the API endpoint.
     */
    async getData() {
        const urlApi = "http://192.168.3.91:8080/cors?url=https://developer.sepush.co.za/business/2.0/area?id=capetown-11-plumstead&test=current";
//        const urlApi = "http://192.168.3.91:8080/cors?url=https://developer.sepush.co.za/business/2.0/area?id=capetown-11-plumstead";

        let retry = true; // Initialize retry flag to true

        try {
            const response = await fetch(urlApi); // Send a GET request to the API URL and wait for the response
            if (response.ok) { // Check if the response status is OK (i.e., 200-299)
                const data = await response.json(); // Parse the response body as JSON and wait for the result
                this.processData(data); // Call the processData method of the current object and pass the parsed data
            } else {
                throw new Error("Could not load data."); // Throw an error if the response status is not OK
            }
        } catch (error) {
            console.error(error); // Log the error to the console
            retry = false; // Set the retry flag to false to prevent retrying the request
        }

        if (retry) { // If retry flag is still true
            const delay = (this.loaded) ? -1 : this.config.retryDelay; // Calculate the delay based on the current state
            this.scheduleUpdate(delay); // Schedule an update of the data (or retry the request) based on the calculated delay
        }
    },


    /*
     * This method takes a delay parameter and calculates the next load time based on the update interval and the delay.
     * It then schedules a call to the getData method of the current object using the setTimeout function with the next load time as the delay.
     * If the delay parameter is not specified or is negative, it uses the default update interval specified in the config object of the current object.
     * This method is used to schedule periodic updates or retries of failed requests in the current object.
     */
    scheduleUpdate(delay) {
        // Calculate the next load time based on the update interval and delay.
        const nextLoad = (delay >= 0) ? delay : this.config.updateInterval;

        // Schedule a call to getData after the next load time.
        setTimeout(() => {
            this.getData();
        }, nextLoad);
    },


    getDom() {
        // Create a wrapper div element and set its class name to the class specified in the config or a default class if not provided.
        const wrapper = document.createElement("div");
        wrapper.className = this.config.classes || "thin xlarge bright pre-line";

        // Return the wrapper if dataRequest is not available.
        if (!this.dataRequest) {
            return wrapper;
        }

        // Sort events by start date.
        const events = this.dataRequest.events.sort((a, b) => new Date(a.start) - new Date(b.start));

        // Get the scheduled days from dataRequest.
        const scheduledDays = this.dataRequest.schedule.days;

        // Create an object to store load shed events and an array to maintain the order of keys.
        const loadShedEvent = {};
        const keyOrder = [];

        // Loop through each event and process its load shed times for each day.
        events.forEach(event => {
            const stageNote = event.note;
            const key = `${event.start} - ${event.end} (${stageNote})`;
            loadShedEvent[key] = [];
            keyOrder.push(key);

            const startDay = event.start.substring(0, 10);
            const stage = parseInt(stageNote.match(/\d+/)[0]);

            // Loop through each day in scheduledDays and check if the event is scheduled for that day.
            scheduledDays.forEach(day => {
                if (day.date === startDay) {
                    const stageTime = day.stages[stage - 1];

                    // Get the start and end time of the event and convert them to timestamps.
                    const startTime = new Date(event.start).getTime();
                    const endTime = new Date(event.end).getTime();

                    // Loop through each time slot of the stage for the current day.
                    stageTime.forEach(timeSlot => {
                        const [start, end] = timeSlot.split("-");

                        // Convert the start time of the time slot to a timestamp.
                        const slotStartDate = new Date(`${day.date}T${start}:00`);
                        const slotStart = slotStartDate.getTime();

                        // Convert the end time of the time slot to a timestamp, accounting for time slots that span across midnight.
                        let slotEndDate = new Date(`${day.date}T${end}:00`);
                        if (end < start) {
                            slotEndDate.setDate(slotEndDate.getDate() + 1);
                        }
                        slotEndDate = slotEndDate.getTime();

                        // Check if the event overlaps with the time slot and add the load shed time to the corresponding key in loadShedEvent.
                        if (startTime >= slotStart && endTime <= slotEndDate) {
                            const tempStartDate = new Date(startTime);
                            const hours = tempStartDate.getHours().toString().padStart(2, '0');
                            const minutes = tempStartDate.getMinutes().toString().padStart(2, '0');
                            const timeString = `${hours}:${minutes}`;
                            loadShedEvent[key].push(`${timeString}-${end}`);
                        } else if (startTime < slotEndDate && endTime > slotStart) {
                            loadShedEvent[key].push(`${start}-${end}`);
                        }
                    });
                }
            });
        });

        // Create an area div element and set its class name and inner HTML.
        const area = document.createElement("div");
        area.className = "bright small bold align-left";
        area.innerHTML = this.dataRequest.info.name;

        // Append the area div element to the wrapper.
        wrapper.appendChild(area);

        // Loop through each key in keyOrder and create display elements for the corresponding load shed times.
        keyOrder.forEach(key => {
            const value = loadShedEvent[key];

            const displayEvent = document.createElement("div");
            displayEvent.className = "normal small regular align-left";
            displayEvent.innerHTML = this.formatDateRange(key);

            const displayLoadShedTimes = document.createElement("div");
            displayLoadShedTimes.className = "bright medium bold align-left";
            displayLoadShedTimes.innerHTML = value;

            wrapper.appendChild(displayEvent);
            wrapper.appendChild(displayLoadShedTimes);
        });

        return wrapper;
    },


    getScripts: function () {
        return [];
    },

    getStyles: function () {
        return [];
    },

    // Load translations files
    getTranslations: function () {
        return {};
    },

    processData(data) {
        // Store the data in the dataRequest property of the current object
        this.dataRequest = data;

        // If the module has just loaded (i.e., loaded property is false), update the module's display with the specified animation speed
        if (!this.loaded) {
            this.updateDom(this.config.animationSpeed);
        }

        // Set the loaded property to true to indicate that data has been loaded successfully
        this.loaded = true;

        // Send a notification to the helper module with the loaded data
        this.sendSocketNotification("MMM-LoadShedding-NOTIFICATION_TEST", data);
    },

    socketNotificationReceived(notification, payload) {
        // Check if the notification is the one we're interested in
        if (notification === "MMM-LoadShedding-NOTIFICATION_TEST") {
            // Store the payload in the dataNotification property of the current object
            this.dataNotification = payload;

            // Update the module's display
            this.updateDom();
        }
    },

    formatDateRange(dateRange) {
        const startDate = new Date(dateRange.substring(0, 25));
        const endDate = new Date(dateRange.substring(28, 28 + 25));

        // Get the long-form day name for the start and end dates
        const startDay = startDate.toLocaleString("en-us", {weekday: "long"});
        const endDay = endDate.toLocaleString("en-us", {weekday: "long"});

        // Get the long-form month name for the start and end dates
        const startMonth = startDate.toLocaleString("en-us", {month: "long"});
        const endMonth = endDate.toLocaleString("en-us", {month: "long"});

        // Get the formatted time for the start and end dates
        const startHour = startDate.toLocaleString("en-us", {hour: "2-digit", minute: "2-digit", hour12: false});
        const endHour = endDate.toLocaleString("en-us", {hour: "2-digit", minute: "2-digit", hour12: false});

        let formattedDateRange;

        // If start and end dates are on the same day, format as "day, month date startHour - endHour"
        if (startDay === endDay) {
            formattedDateRange = `${startDay}, ${startMonth} ${startDate.getDate()} ${startHour} - ${endHour}`;
        } else {
            // If start and end dates are on different days, format as "startDay, startMonth startDate startHour - endDay, endMonth endDate endHour"
            formattedDateRange = `${startDay}, ${startMonth} ${startDate.getDate()} ${startHour} - ${endDay}, ${endMonth} ${endDate.getDate()} ${endHour}`;
        }

        // Append any remaining characters in the original dateRange string to the formatted string
        return formattedDateRange + " " + dateRange.substring(54, dateRange.length);
    },

});
