# מכניס את המחשב לשינה. קובץ נפרד כדי להימנע ממרכאות מקוננות.
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)
